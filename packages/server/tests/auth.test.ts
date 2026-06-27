import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestApp } from "./helpers.js";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../src/bootstrap.js";
import type { IdentityProviderConfig, TenantBootstrapResult } from "@agentforge/types";
import { hashPassword } from "../src/local-auth.js";

describe("Auth", () => {
  let app: FastifyInstance;
  let ctx: AppContext;
  let tenant: TenantBootstrapResult;
  const originalFetch = global.fetch;
  const oidcSecretEnv = "OIDC_" + "CLIENT_SECRET";
  const oauthSecretEnv = "OAUTH_" + "CLIENT_SECRET";

  beforeEach(async () => {
    const t = await createTestApp();
    app = t.app;
    ctx = t.ctx;
    tenant = await ctx.db.ensureDefaultTenant();
    process.env[oidcSecretEnv] = "client-secret-value";
    process.env[oauthSecretEnv] = "oauth-secret-value";
    await app.ready();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env[oidcSecretEnv];
    delete process.env[oauthSecretEnv];
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

  describe("Enterprise OAuth auth", () => {
    it("should expose enabled Feishu, WeCom, and DingTalk providers in auth bootstrap", async () => {
      const feishu = await createOAuthProvider("feishu", "Feishu");
      const wecom = await createOAuthProvider("wecom", "WeCom", { claimMapping: { agentId: "1000002" } });
      const dingtalk = await createOAuthProvider("dingtalk", "DingTalk");

      const res = await app.inject({ method: "GET", url: "/api/auth/bootstrap" });

      expect(res.statusCode).toBe(200);
      expect(res.json().oauthProviders).toEqual([
        { id: feishu.id, name: "Feishu", provider: "feishu" },
        { id: wecom.id, name: "WeCom", provider: "wecom" },
        { id: dingtalk.id, name: "DingTalk", provider: "dingtalk" },
      ]);
    });

    it("should create a user session from Feishu callback", async () => {
      const provider = await createOAuthProvider("feishu", "Feishu");
      mockFeishuFetch();
      const start = await app.inject({ method: "GET", url: `/api/auth/oauth/${provider.id}/start?redirect=/dashboard` });
      const location = new URL(String(start.headers.location));
      expect(location.origin).toBe("https://accounts.feishu.cn");
      expect(location.searchParams.get("client_id")).toBe("enterprise-client");
      expect(location.searchParams.get("redirect_uri")).toBe(`http://localhost/api/auth/oauth/${provider.id}/callback`);
      expect(String(start.headers["set-cookie"])).toContain("agentforge_oauth_state=");

      const callback = await app.inject({
        method: "GET",
        url: `/api/auth/oauth/${provider.id}/callback?code=feishu-code&state=${location.searchParams.get("state")}`,
        headers: { cookie: String(start.headers["set-cookie"]) },
      });

      expect(callback.statusCode).toBe(302);
      expect(callback.headers.location).toBe("/dashboard");
      expect(String(callback.headers["set-cookie"])).toContain("agentforge_session=");
      expect((await ctx.db.getUserByEmail("feishu@example.com"))?.displayName).toBe("Feishu User");
      const logs = await ctx.db.listAuditLogs(tenant.organization.id);
      expect(logs.map((log) => log.action)).toContain("auth.oauth_login");
    });

    it("should create a user session from DingTalk callback", async () => {
      const provider = await createOAuthProvider("dingtalk", "DingTalk");
      mockDingTalkFetch();
      const start = await app.inject({ method: "GET", url: `/api/auth/oauth/${provider.id}/start` });
      const location = new URL(String(start.headers.location));
      expect(location.origin).toBe("https://login.dingtalk.com");
      expect(location.searchParams.get("scope")).toBe("openid");

      const callback = await app.inject({
        method: "GET",
        url: `/api/auth/oauth/${provider.id}/callback?auth_code=dingtalk-code&state=${location.searchParams.get("state")}`,
        headers: { cookie: String(start.headers["set-cookie"]) },
      });

      expect(callback.statusCode).toBe(302);
      expect((await ctx.db.getUserByEmail("dingtalk@example.com"))?.displayName).toBe("DingTalk User");
    });

    it("should create a user session from WeCom callback", async () => {
      const provider = await createOAuthProvider("wecom", "WeCom", { claimMapping: { agentId: "1000002" } });
      mockWeComFetch();
      const start = await app.inject({ method: "GET", url: `/api/auth/oauth/${provider.id}/start` });
      const location = new URL(String(start.headers.location));
      expect(location.origin).toBe("https://open.work.weixin.qq.com");
      expect(location.searchParams.get("appid")).toBe("enterprise-client");
      expect(location.searchParams.get("agentid")).toBe("1000002");

      const callback = await app.inject({
        method: "GET",
        url: `/api/auth/oauth/${provider.id}/callback?code=wecom-code&state=${location.searchParams.get("state")}`,
        headers: { cookie: String(start.headers["set-cookie"]) },
      });

      expect(callback.statusCode).toBe(302);
      expect((await ctx.db.getUserByEmail("wecom@example.com"))?.displayName).toBe("WeCom User");
    });

    it("should reject an invalid OAuth state", async () => {
      const provider = await createOAuthProvider("feishu", "Feishu");
      mockFeishuFetch();
      const start = await app.inject({ method: "GET", url: `/api/auth/oauth/${provider.id}/start` });

      const callback = await app.inject({
        method: "GET",
        url: `/api/auth/oauth/${provider.id}/callback?code=feishu-code&state=wrong-state`,
        headers: { cookie: String(start.headers["set-cookie"]) },
      });

      expect(callback.statusCode).toBe(401);
      expect(await ctx.db.getUserByEmail("feishu@example.com")).toBeNull();
    });
  });

  describe("RBAC", () => {
    it("should allow viewers to read but not mutate workspace resources", async () => {
      const cookie = await loginAsRole("viewer");

      const read = await app.inject({
        method: "GET",
        url: "/api/agents",
        headers: { cookie },
      });
      expect(read.statusCode).toBe(200);

      const write = await app.inject({
        method: "POST",
        url: "/api/agents",
        headers: { cookie },
        payload: { name: "Viewer Agent", systemPrompt: "test" },
      });
      expect(write.statusCode).toBe(403);
    });

    it("should allow builders to mutate workspace resources", async () => {
      const cookie = await loginAsRole("builder");

      const res = await app.inject({
        method: "POST",
        url: "/api/agents",
        headers: { cookie },
        payload: { name: "Builder Agent", systemPrompt: "test" },
      });

      expect(res.statusCode).toBe(201);
    });

    it("should reject access outside the user's workspace membership", async () => {
      const otherWorkspace = await ctx.db.createWorkspace({
        organizationId: tenant.organization.id,
        name: "Other Workspace",
        slug: "other",
      });
      const cookie = await loginAsRole("viewer");

      const res = await app.inject({
        method: "GET",
        url: "/api/agents",
        headers: { cookie, "x-workspace-id": otherWorkspace.id },
      });

      expect(res.statusCode).toBe(403);
    });

    it("should require admin role for tenant-level mutations", async () => {
      const cookie = await loginAsRole("builder");

      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: { email: "new-user@example.com", displayName: "New User" },
      });

      expect(res.statusCode).toBe(403);
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

  async function createOAuthProvider(provider: "feishu" | "wecom" | "dingtalk", name: string, extra: Partial<IdentityProviderConfig> = {}): Promise<IdentityProviderConfig> {
    return await ctx.db.createIdentityProvider({
      organizationId: tenant.organization.id,
      type: "oauth",
      provider,
      name,
      clientId: "enterprise-client",
      clientSecretRef: `env:${oauthSecretEnv}`,
      claimMapping: extra.claimMapping,
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

  function mockFeishuFetch() {
    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://open.feishu.cn/open-apis/authen/v2/oauth/token") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body)).code).toBe("feishu-code");
        return jsonResponse({ data: { access_token: "feishu-access-token" } });
      }
      if (url === "https://open.feishu.cn/open-apis/authen/v1/user_info") {
        expect(init?.headers).toEqual({ authorization: "Bearer feishu-access-token" });
        return jsonResponse({ data: { open_id: "ou_123", email: "feishu@example.com", name: "Feishu User" } });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
  }

  function mockDingTalkFetch() {
    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.dingtalk.com/v1.0/oauth2/userAccessToken") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body)).code).toBe("dingtalk-code");
        return jsonResponse({ accessToken: "dingtalk-access-token" });
      }
      if (url === "https://api.dingtalk.com/v1.0/contact/users/me") {
        expect(init?.headers).toEqual({ "x-acs-dingtalk-access-token": "dingtalk-access-token" });
        return jsonResponse({ unionId: "ding-union-id", email: "dingtalk@example.com", nick: "DingTalk User" });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
  }

  function mockWeComFetch() {
    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.origin === "https://qyapi.weixin.qq.com" && url.pathname === "/cgi-bin/gettoken") {
        expect(url.searchParams.get("corpid")).toBe("enterprise-client");
        expect(url.searchParams.get("corpsecret")).toBe("oauth-secret-value");
        return jsonResponse({ errcode: 0, access_token: "wecom-access-token" });
      }
      if (url.origin === "https://qyapi.weixin.qq.com" && url.pathname === "/cgi-bin/auth/getuserinfo") {
        expect(url.searchParams.get("code")).toBe("wecom-code");
        return jsonResponse({ errcode: 0, UserId: "wecom-user-id", user_ticket: "wecom-ticket" });
      }
      if (url.origin === "https://qyapi.weixin.qq.com" && url.pathname === "/cgi-bin/auth/getuserdetail") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body)).user_ticket).toBe("wecom-ticket");
        return jsonResponse({ errcode: 0, userid: "wecom-user-id", biz_mail: "wecom@example.com", name: "WeCom User" });
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

  async function loginAsRole(role: "viewer" | "builder" | "admin" | "owner"): Promise<string> {
    const email = `${role}@example.com`;
    const userPassword = `${role}-pass`;
    const user = await ctx.db.createUser({ email, displayName: role });
    await ctx.db.setUserPassword(user.id, hashPassword(userPassword));
    await ctx.db.upsertMembership({ organizationId: tenant.organization.id, userId: user.id, workspaceId: null, role });
    await ctx.db.upsertMembership({ organizationId: tenant.organization.id, userId: user.id, workspaceId: tenant.workspace.id, role });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: userPassword },
    });
    expect(login.statusCode).toBe(200);
    return String(login.headers["set-cookie"]);
  }
});
