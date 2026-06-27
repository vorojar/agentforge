import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestApp } from "./helpers.js";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../src/bootstrap.js";
import type { IdentityProviderConfig, TenantBootstrapResult } from "@agentforge/types";

describe("Auth", () => {
  let app: FastifyInstance;
  let ctx: AppContext;
  let tenant: TenantBootstrapResult;
  const originalFetch = global.fetch;
  const oidcSecretEnv = "OIDC_" + "CLIENT_SECRET";

  beforeEach(async () => {
    const t = await createTestApp();
    app = t.app;
    ctx = t.ctx;
    tenant = await ctx.db.ensureDefaultTenant();
    process.env[oidcSecretEnv] = "client-secret-value";
    await app.ready();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env[oidcSecretEnv];
  });

  describe("Admin auth", () => {
    it("should pass with correct admin secret", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/agents",
        headers: { "x-admin-secret": "test-secret" },
      });

      expect(res.statusCode).toBe(200);
    });

    it("should fail with wrong admin secret", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/agents",
        headers: { "x-admin-secret": "wrong-secret" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("should fail without admin secret", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/agents",
        headers: {},
      });

      expect(res.statusCode).toBe(401);
    });

    it("should pass admin routes with a logged-in session cookie", async () => {
      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "demo@example.com", password: "password" },
      });

      expect(login.statusCode).toBe(200);
      expect(login.json().user.email).toBe("demo@example.com");
      const cookie = login.headers["set-cookie"];
      expect(cookie).toContain("agentforge_session=");

      const res = await app.inject({
        method: "GET",
        url: "/api/agents",
        headers: { cookie: String(cookie) },
      });

      expect(res.statusCode).toBe(200);
    });

    it("should reject wrong local login password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "demo@example.com", password: "bad-pass" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("should normalize local login email", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: " Demo@Example.COM ", password: "password" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().user.email).toBe("demo@example.com");
    });

    it("should clear a session on logout", async () => {
      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "demo@example.com", password: "password" },
      });
      const cookie = String(login.headers["set-cookie"]);

      const logout = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie },
      });
      expect(logout.statusCode).toBe(200);

      const res = await app.inject({
        method: "GET",
        url: "/api/agents",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("API key auth", () => {
    it("should resolve agent with valid API key", async () => {
      const agent = await ctx.db.createAgent({ name: "Auth Test Agent", systemPrompt: "test" });
      const { rawKey } = await ctx.db.createApiKey(agent.id, "test");

      const res = await app.inject({
        method: "POST",
        url: "/api/chat",
        headers: { authorization: `Bearer ${rawKey}` },
        payload: { message: "Hello" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.reply).toBeDefined();
    });

    it("should reject invalid API key", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/chat",
        headers: { authorization: "Bearer bad-key-123" },
        payload: { message: "Hello" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("OIDC auth", () => {
    it("should expose enabled OIDC providers in auth bootstrap", async () => {
      const provider = await createOidcProvider();

      const res = await app.inject({ method: "GET", url: "/api/auth/bootstrap" });

      expect(res.statusCode).toBe(200);
      expect(res.json().oidcProviders).toEqual([
        { id: provider.id, name: "Generic OIDC", provider: "generic-oidc" },
      ]);
    });

    it("should redirect to the provider authorization endpoint", async () => {
      const provider = await createOidcProvider();
      mockOidcFetch();

      const res = await app.inject({
        method: "GET",
        url: `/api/auth/oidc/${provider.id}/start?redirect=/dashboard`,
      });

      expect(res.statusCode).toBe(302);
      const location = new URL(String(res.headers.location));
      expect(location.origin).toBe("https://idp.example.com");
      expect(location.pathname).toBe("/authorize");
      expect(location.searchParams.get("client_id")).toBe("agentforge-client");
      expect(location.searchParams.get("scope")).toBe("openid email profile");
      expect(location.searchParams.get("redirect_uri")).toBe(`http://localhost/api/auth/oidc/${provider.id}/callback`);
      expect(String(res.headers["set-cookie"])).toContain("agentforge_oidc_state=");
    });

    it("should create a user session from OIDC callback", async () => {
      const provider = await createOidcProvider();
      mockOidcFetch();
      const start = await app.inject({ method: "GET", url: `/api/auth/oidc/${provider.id}/start?redirect=/dashboard` });
      const state = new URL(String(start.headers.location)).searchParams.get("state");
      const stateCookie = String(start.headers["set-cookie"]);

      const callback = await app.inject({
        method: "GET",
        url: `/api/auth/oidc/${provider.id}/callback?code=auth-code&state=${state}`,
        headers: { cookie: stateCookie },
      });

      expect(callback.statusCode).toBe(302);
      expect(callback.headers.location).toBe("/dashboard");
      expect(String(callback.headers["set-cookie"])).toContain("agentforge_session=");
      const user = await ctx.db.getUserByEmail("sso@example.com");
      expect(user?.displayName).toBe("SSO User");
      const memberships = await ctx.db.listMemberships(tenant.organization.id);
      expect(memberships.some((membership) => membership.userId === user?.id && membership.role === "viewer")).toBe(true);
      const logs = await ctx.db.listAuditLogs(tenant.organization.id);
      expect(logs.map((log) => log.action)).toContain("auth.oidc_login");
    });

    it("should reject an invalid OIDC state", async () => {
      const provider = await createOidcProvider();
      mockOidcFetch();
      const start = await app.inject({ method: "GET", url: `/api/auth/oidc/${provider.id}/start` });

      const callback = await app.inject({
        method: "GET",
        url: `/api/auth/oidc/${provider.id}/callback?code=auth-code&state=wrong-state`,
        headers: { cookie: String(start.headers["set-cookie"]) },
      });

      expect(callback.statusCode).toBe(401);
      expect(await ctx.db.getUserByEmail("sso@example.com")).toBeNull();
    });

    it("should preserve existing elevated membership roles", async () => {
      const provider = await createOidcProvider();
      const user = await ctx.db.createUser({ email: "sso@example.com", displayName: "Existing Admin" });
      await ctx.db.upsertMembership({ organizationId: tenant.organization.id, userId: user.id, workspaceId: null, role: "owner" });
      await ctx.db.upsertMembership({ organizationId: tenant.organization.id, userId: user.id, workspaceId: tenant.workspace.id, role: "owner" });
      mockOidcFetch();
      const start = await app.inject({ method: "GET", url: `/api/auth/oidc/${provider.id}/start` });
      const state = new URL(String(start.headers.location)).searchParams.get("state");

      const callback = await app.inject({
        method: "GET",
        url: `/api/auth/oidc/${provider.id}/callback?code=auth-code&state=${state}`,
        headers: { cookie: String(start.headers["set-cookie"]) },
      });

      expect(callback.statusCode).toBe(302);
      const memberships = await ctx.db.listMemberships(tenant.organization.id);
      expect(memberships.filter((membership) => membership.userId === user.id).map((membership) => membership.role)).toEqual(["owner", "owner"]);
    });
  });

  async function createOidcProvider(): Promise<IdentityProviderConfig> {
    return await ctx.db.createIdentityProvider({
      organizationId: tenant.organization.id,
      type: "oidc",
      provider: "generic-oidc",
      name: "Generic OIDC",
      issuerUrl: "https://idp.example.com",
      clientId: "agentforge-client",
      clientSecretRef: `env:${oidcSecretEnv}`,
      enabled: true,
    });
  }

  function mockOidcFetch() {
    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/.well-known/openid-configuration")) {
        return jsonResponse({
          authorization_endpoint: "https://idp.example.com/authorize",
          token_endpoint: "https://idp.example.com/token",
          userinfo_endpoint: "https://idp.example.com/userinfo",
        });
      }
      if (url === "https://idp.example.com/token") {
        expect(init?.method).toBe("POST");
        return jsonResponse({ access_token: "oidc-access-token" });
      }
      if (url === "https://idp.example.com/userinfo") {
        expect(init?.headers).toEqual({ authorization: "Bearer oidc-access-token" });
        return jsonResponse({
          sub: "subject-123",
          email: "sso@example.com",
          email_verified: true,
          name: "SSO User",
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
  }

  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
});
