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
