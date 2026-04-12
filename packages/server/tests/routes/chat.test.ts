import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp } from "../helpers.js";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../src/bootstrap.js";

describe("Chat routes", () => {
  let app: FastifyInstance;
  let ctx: AppContext;
  let rawKey: string;

  beforeEach(async () => {
    const t = await createTestApp();
    app = t.app;
    ctx = t.ctx;
    await app.ready();

    // Create an agent and an API key
    const agent = await ctx.db.createAgent({ name: "Chat Agent", systemPrompt: "You help." });
    const keyResult = await ctx.db.createApiKey(agent.id, "default");
    rawKey = keyResult.rawKey;
  });

  it("should return a chat response with valid API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { message: "Hello" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.reply).toBeDefined();
    expect(body.sessionId).toBeDefined();
    expect(body.usage).toBeDefined();
  });

  it("should return 401 with invalid API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: "Bearer invalid-key" },
      payload: { message: "Hello" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("should return 401 without authorization header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: {},
      payload: { message: "Hello" },
    });

    expect(res.statusCode).toBe(401);
  });
});
