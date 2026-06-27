import type { FastifyInstance } from "fastify";
import type { IdentityProviderType, MembershipStatus, OrganizationRole } from "@agentforge/types";
import type { AppContext } from "../bootstrap.js";
import { recordAuditLog } from "../audit.js";

const ROLES = new Set<OrganizationRole>(["owner", "admin", "builder", "viewer"]);
const STATUSES = new Set<MembershipStatus>(["active", "invited", "disabled"]);
const IDENTITY_PROVIDER_TYPES = new Set<IdentityProviderType>(["local", "oidc", "saml", "oauth"]);

export async function tenantRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db } = opts.ctx;

  fastify.get("/api/tenant/bootstrap", async () => {
    return await db.ensureDefaultTenant();
  });

  fastify.get("/api/organizations", async () => {
    return await db.listOrganizations();
  });

  fastify.post("/api/organizations", async (request, reply) => {
    const body = request.body as { name?: string; slug?: string };
    if (!body.name?.trim()) {
      return reply.code(400).send({ error: "name is required" });
    }
    const organization = await db.createOrganization({ name: body.name, slug: body.slug });
    await recordAuditLog(db, request, {
      organizationId: organization.id,
      action: "organization.create",
      resourceType: "organization",
      resourceId: organization.id,
      metadata: { slug: organization.slug },
    });
    return reply.code(201).send(organization);
  });

  fastify.get("/api/organizations/:organizationId/workspaces", async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    return await db.listWorkspaces(organizationId);
  });

  fastify.post("/api/organizations/:organizationId/workspaces", async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    const body = request.body as { name?: string; slug?: string };
    const organization = await db.getOrganization(organizationId);
    if (!organization) return reply.code(404).send({ error: "Organization not found" });
    if (!body.name?.trim()) return reply.code(400).send({ error: "name is required" });

    const workspace = await db.createWorkspace({ organizationId, name: body.name, slug: body.slug });
    await recordAuditLog(db, request, {
      organizationId,
      workspaceId: workspace.id,
      action: "workspace.create",
      resourceType: "workspace",
      resourceId: workspace.id,
      metadata: { slug: workspace.slug },
    });
    return reply.code(201).send(workspace);
  });

  fastify.get("/api/users", async () => {
    return await db.listUsers();
  });

  fastify.post("/api/users", async (request, reply) => {
    const body = request.body as { email?: string; displayName?: string; avatarUrl?: string };
    if (!body.email?.trim() || !body.displayName?.trim()) {
      return reply.code(400).send({ error: "email and displayName are required" });
    }
    const user = await db.createUser({
      email: body.email,
      displayName: body.displayName,
      avatarUrl: body.avatarUrl,
    });
    const tenant = await db.ensureDefaultTenant();
    await recordAuditLog(db, request, {
      organizationId: tenant.organization.id,
      action: "user.create",
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: user.email, displayName: user.displayName },
    });
    return reply.code(201).send(user);
  });

  fastify.get("/api/organizations/:organizationId/memberships", async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    const organization = await db.getOrganization(organizationId);
    if (!organization) return reply.code(404).send({ error: "Organization not found" });
    return await db.listMemberships(organizationId, workspaceId);
  });

  fastify.post("/api/organizations/:organizationId/memberships", async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    const body = request.body as { userId?: string; workspaceId?: string | null; role?: string; status?: string };
    const organization = await db.getOrganization(organizationId);
    if (!organization) return reply.code(404).send({ error: "Organization not found" });
    if (!body.userId || !body.role) return reply.code(400).send({ error: "userId and role are required" });
    if (!ROLES.has(body.role as OrganizationRole)) return reply.code(400).send({ error: "invalid role" });
    if (body.status && !STATUSES.has(body.status as MembershipStatus)) return reply.code(400).send({ error: "invalid status" });

    const membership = await db.upsertMembership({
      organizationId,
      userId: body.userId,
      workspaceId: body.workspaceId ?? null,
      role: body.role as OrganizationRole,
      status: body.status as MembershipStatus | undefined,
    });
    await recordAuditLog(db, request, {
      organizationId,
      workspaceId: membership.workspaceId,
      action: "membership.upsert",
      resourceType: "membership",
      resourceId: membership.id,
      metadata: { userId: membership.userId, role: membership.role, status: membership.status },
    });
    return reply.code(201).send(membership);
  });

  fastify.get("/api/organizations/:organizationId/identity-providers", async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    const organization = await db.getOrganization(organizationId);
    if (!organization) return reply.code(404).send({ error: "Organization not found" });
    return await db.listIdentityProviders(organizationId);
  });

  fastify.post("/api/organizations/:organizationId/identity-providers", async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    const body = request.body as Record<string, unknown>;
    const organization = await db.getOrganization(organizationId);
    if (!organization) return reply.code(404).send({ error: "Organization not found" });
    if (typeof body.type !== "string" || typeof body.provider !== "string" || typeof body.name !== "string") {
      return reply.code(400).send({ error: "type, provider, and name are required" });
    }
    if (!body.provider.trim() || !body.name.trim()) {
      return reply.code(400).send({ error: "provider and name are required" });
    }
    if (!IDENTITY_PROVIDER_TYPES.has(body.type as IdentityProviderType)) {
      return reply.code(400).send({ error: "invalid identity provider type" });
    }

    const provider = await db.createIdentityProvider({
      organizationId,
      type: body.type as IdentityProviderType,
      provider: String(body.provider),
      name: String(body.name),
      issuerUrl: typeof body.issuerUrl === "string" ? body.issuerUrl : undefined,
      clientId: typeof body.clientId === "string" ? body.clientId : undefined,
      clientSecretRef: typeof body.clientSecretRef === "string" ? body.clientSecretRef : undefined,
      ssoUrl: typeof body.ssoUrl === "string" ? body.ssoUrl : undefined,
      certificate: typeof body.certificate === "string" ? body.certificate : undefined,
      claimMapping: isStringRecord(body.claimMapping) ? body.claimMapping : undefined,
      groupMapping: isStringRecord(body.groupMapping) ? body.groupMapping : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    });
    await recordAuditLog(db, request, {
      organizationId,
      action: "identity_provider.create",
      resourceType: "identity_provider",
      resourceId: provider.id,
      metadata: { type: provider.type, provider: provider.provider, enabled: provider.enabled },
    });
    return reply.code(201).send(provider);
  });

  fastify.get("/api/organizations/:organizationId/audit-logs", async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    const { workspaceId, limit } = request.query as { workspaceId?: string; limit?: string };
    const organization = await db.getOrganization(organizationId);
    if (!organization) return reply.code(404).send({ error: "Organization not found" });
    return await db.listAuditLogs(organizationId, {
      workspaceId,
      limit: parseLimit(limit),
    });
  });
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function parseLimit(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
