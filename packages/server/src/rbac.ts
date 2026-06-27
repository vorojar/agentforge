import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser, DatabaseAdapter, OrganizationRole } from "@agentforge/types";
import { resolveWorkspaceId } from "./workspace.js";

type MinimumRole = "viewer" | "builder" | "admin";

const ROLE_RANK: Record<OrganizationRole, number> = {
  viewer: 1,
  builder: 2,
  admin: 3,
  owner: 4,
};

export async function canAccessAdminRoute(request: FastifyRequest, db: DatabaseAdapter, user: AuthenticatedUser): Promise<boolean> {
  const minimumRole = minimumRoleFor(request);
  const scope = await resolveAccessScope(request, db);
  return hasRole(user, scope.organizationId, scope.workspaceId, minimumRole);
}

function minimumRoleFor(request: FastifyRequest): MinimumRole {
  if (request.method === "GET" || request.method === "HEAD") return "viewer";
  if (request.url.startsWith("/api/organizations") || request.url.startsWith("/api/users")) return "admin";
  return "builder";
}

async function resolveAccessScope(request: FastifyRequest, db: DatabaseAdapter): Promise<{ organizationId: string; workspaceId: string | null }> {
  const organizationId = organizationIdFromUrl(request.url);
  if (organizationId) {
    const body = request.body as { workspaceId?: string | null } | undefined;
    const query = request.query as { workspaceId?: string } | undefined;
    const workspaceId = body?.workspaceId ?? query?.workspaceId ?? null;
    return { organizationId, workspaceId };
  }

  const workspaceId = await resolveWorkspaceId(request, db);
  const workspace = await db.getWorkspace(workspaceId);
  if (workspace) return { organizationId: workspace.organizationId, workspaceId: workspace.id };
  const tenant = await db.ensureDefaultTenant();
  return { organizationId: tenant.organization.id, workspaceId: tenant.workspace.id };
}

function hasRole(user: AuthenticatedUser, organizationId: string, workspaceId: string | null, minimumRole: MinimumRole): boolean {
  const needed = ROLE_RANK[minimumRole];
  return user.memberships.some((membership) => {
    if (membership.organizationId !== organizationId || membership.status !== "active") return false;
    const appliesToScope = membership.workspaceId === workspaceId || (
      membership.workspaceId === null && (workspaceId === null || ROLE_RANK[membership.role] >= ROLE_RANK.admin)
    );
    return appliesToScope && ROLE_RANK[membership.role] >= needed;
  });
}

function organizationIdFromUrl(url: string): string | null {
  const match = url.match(/^\/api\/organizations\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
