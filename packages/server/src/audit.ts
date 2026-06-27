import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser, DatabaseAdapter } from "@agentforge/types";

interface AuditInput {
  organizationId?: string;
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAuditLog(db: DatabaseAdapter, request: FastifyRequest, input: AuditInput): Promise<void> {
  const { organizationId, workspaceId } = await resolveAuditScope(db, input);
  await db.createAuditLog({
    organizationId,
    workspaceId,
    actorUserId: input.actorUserId ?? request.currentUser?.id ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? {},
    ipAddress: readClientIp(request),
    userAgent: readHeader(request.headers["user-agent"]),
  });
}

export async function recordUserMembershipAuditLogs(
  db: DatabaseAdapter,
  request: FastifyRequest,
  user: AuthenticatedUser,
  action: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  let organizationIds = [...new Set(user.memberships.map((membership) => membership.organizationId))];
  if (organizationIds.length === 0) {
    organizationIds = [(await db.ensureDefaultTenant()).organization.id];
  }

  for (const organizationId of organizationIds) {
    await recordAuditLog(db, request, {
      organizationId,
      actorUserId: user.id,
      action,
      resourceType: "auth_session",
      resourceId: user.id,
      metadata,
    });
  }
}

async function resolveAuditScope(db: DatabaseAdapter, input: AuditInput): Promise<{ organizationId: string; workspaceId: string | null }> {
  if (input.organizationId) {
    return { organizationId: input.organizationId, workspaceId: input.workspaceId ?? null };
  }

  if (input.workspaceId) {
    const workspace = await db.getWorkspace(input.workspaceId);
    if (!workspace) throw new Error(`Cannot audit ${input.action}: workspace not found`);
    return { organizationId: workspace.organizationId, workspaceId: workspace.id };
  }

  const tenant = await db.ensureDefaultTenant();
  return { organizationId: tenant.organization.id, workspaceId: null };
}

function readClientIp(request: FastifyRequest): string | undefined {
  const forwarded = readHeader(request.headers["x-forwarded-for"]);
  return forwarded?.split(",")[0]?.trim() || request.ip;
}

function readHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
