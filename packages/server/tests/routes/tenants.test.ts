import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers.js";

describe("Tenant routes", () => {
  let app: FastifyInstance;
  const adminHeaders = { "x-admin-secret": "test-secret" };

  beforeEach(async () => {
    const t = await createTestApp();
    app = t.app;
    await app.ready();
  });

  it("should bootstrap the default tenant", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/tenant/bootstrap",
      headers: adminHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.organization.slug).toBe("default");
    expect(body.workspace.organizationId).toBe(body.organization.id);
  });

  it("should create tenant records and expose audit logs", async () => {
    const orgRes = await app.inject({
      method: "POST",
      url: "/api/organizations",
      headers: adminHeaders,
      payload: { name: "Globex", slug: "globex" },
    });
    expect(orgRes.statusCode).toBe(201);
    const organization = orgRes.json();

    const workspaceRes = await app.inject({
      method: "POST",
      url: `/api/organizations/${organization.id}/workspaces`,
      headers: adminHeaders,
      payload: { name: "Research", slug: "research" },
    });
    expect(workspaceRes.statusCode).toBe(201);
    const workspace = workspaceRes.json();

    const userRes = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: adminHeaders,
      payload: { email: "builder@example.com", displayName: "Builder" },
    });
    expect(userRes.statusCode).toBe(201);
    const user = userRes.json();

    const membershipRes = await app.inject({
      method: "POST",
      url: `/api/organizations/${organization.id}/memberships`,
      headers: adminHeaders,
      payload: { userId: user.id, workspaceId: workspace.id, role: "builder" },
    });
    expect(membershipRes.statusCode).toBe(201);
    expect(membershipRes.json().role).toBe("builder");

    const idpRes = await app.inject({
      method: "POST",
      url: `/api/organizations/${organization.id}/identity-providers`,
      headers: adminHeaders,
      payload: {
        type: "oidc",
        provider: "google",
        name: "Google Workspace",
        issuerUrl: "https://accounts.google.com",
        clientId: "client-id",
        clientSecretRef: "env:GOOGLE_CLIENT_SECRET",
      },
    });
    expect(idpRes.statusCode).toBe(201);
    expect(idpRes.json().clientSecretRef).toBe("env:GOOGLE_CLIENT_SECRET");

    const auditRes = await app.inject({
      method: "GET",
      url: `/api/organizations/${organization.id}/audit-logs`,
      headers: adminHeaders,
    });
    expect(auditRes.statusCode).toBe(200);
    expect(auditRes.json().map((log: { action: string }) => log.action)).toContain("identity_provider.create");
  });

  it("should reject invalid membership roles", async () => {
    const org = (await app.inject({
      method: "POST",
      url: "/api/organizations",
      headers: adminHeaders,
      payload: { name: "Invalid Role Org" },
    })).json();

    const user = (await app.inject({
      method: "POST",
      url: "/api/users",
      headers: adminHeaders,
      payload: { email: "viewer@example.com", displayName: "Viewer" },
    })).json();

    const res = await app.inject({
      method: "POST",
      url: `/api/organizations/${org.id}/memberships`,
      headers: adminHeaders,
      payload: { userId: user.id, role: "super-admin" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid role");
  });

  it("should isolate admin resources by workspace header", async () => {
    const org = (await app.inject({
      method: "POST",
      url: "/api/organizations",
      headers: adminHeaders,
      payload: { name: "Scoped Org", slug: "scoped-org" },
    })).json();

    const workspaceA = (await app.inject({
      method: "POST",
      url: `/api/organizations/${org.id}/workspaces`,
      headers: adminHeaders,
      payload: { name: "Workspace A", slug: "workspace-a" },
    })).json();

    const workspaceB = (await app.inject({
      method: "POST",
      url: `/api/organizations/${org.id}/workspaces`,
      headers: adminHeaders,
      payload: { name: "Workspace B", slug: "workspace-b" },
    })).json();

    const agentA = (await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { ...adminHeaders, "x-workspace-id": workspaceA.id },
      payload: { name: "Agent A", systemPrompt: "A" },
    })).json();

    const agentB = (await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { ...adminHeaders, "x-workspace-id": workspaceB.id },
      payload: { name: "Agent B", systemPrompt: "B" },
    })).json();

    const listA = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { ...adminHeaders, "x-workspace-id": workspaceA.id },
    });
    expect(listA.json().map((agent: { id: string }) => agent.id)).toEqual([agentA.id]);

    const listB = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { ...adminHeaders, "x-workspace-id": workspaceB.id },
    });
    expect(listB.json().map((agent: { id: string }) => agent.id)).toEqual([agentB.id]);

    const crossGet = await app.inject({
      method: "GET",
      url: `/api/agents/${agentA.id}`,
      headers: { ...adminHeaders, "x-workspace-id": workspaceB.id },
    });
    expect(crossGet.statusCode).toBe(404);

    const providerA = await app.inject({
      method: "POST",
      url: "/api/providers",
      headers: { ...adminHeaders, "x-workspace-id": workspaceA.id },
      payload: { name: "Provider A", type: "openai", apiKey: "a", defaultModel: "a", isPrimary: true },
    });
    expect(providerA.statusCode).toBe(201);

    const providersB = await app.inject({
      method: "GET",
      url: "/api/providers",
      headers: { ...adminHeaders, "x-workspace-id": workspaceB.id },
    });
    expect(providersB.json()).toEqual([]);
  });
});
