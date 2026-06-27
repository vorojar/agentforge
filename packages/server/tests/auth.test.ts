import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp } from "./helpers.js";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../src/bootstrap.js";

describe("Auth", () => {
  let app: FastifyInstance;
  let ctx: AppContext;

  beforeEach(async () => {
    const t = await createTestApp();
    app = t.app;
    ctx = t.ctx;
    await app.ready();
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
});
