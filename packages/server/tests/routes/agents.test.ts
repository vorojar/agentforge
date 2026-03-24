import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp } from "../helpers.js";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../src/bootstrap.js";

describe("Agent routes", () => {
  let app: FastifyInstance;
  let ctx: AppContext;

  beforeEach(async () => {
    const t = createTestApp();
    app = t.app;
    ctx = t.ctx;
    await app.ready();
  });

  const adminHeaders = { "x-admin-secret": "test-secret" };

  it("should create an agent with an API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: adminHeaders,
      payload: {
        name: "Test Agent",
        systemPrompt: "You are a test agent.",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("Test Agent");
    expect(body.systemPrompt).toBe("You are a test agent.");
    expect(body.apiKeys).toHaveLength(1);
    expect(body.apiKeys[0].rawKey).toBeDefined();
    expect(body.apiKeys[0].rawKey).toMatch(/^af-/);
  });

  it("should list agents", async () => {
    ctx.db.createAgent({ name: "Agent 1", systemPrompt: "prompt 1" });
    ctx.db.createAgent({ name: "Agent 2", systemPrompt: "prompt 2" });

    const res = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: adminHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
  });

  it("should get a single agent", async () => {
    const agent = ctx.db.createAgent({ name: "Agent X", systemPrompt: "test" });

    const res = await app.inject({
      method: "GET",
      url: `/api/agents/${agent.id}`,
      headers: adminHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Agent X");
  });

  it("should return 404 for non-existent agent", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/agents/non-existent-id",
      headers: adminHeaders,
    });

    expect(res.statusCode).toBe(404);
  });

  it("should update an agent", async () => {
    const agent = ctx.db.createAgent({ name: "Old Name", systemPrompt: "test" });

    const res = await app.inject({
      method: "PUT",
      url: `/api/agents/${agent.id}`,
      headers: adminHeaders,
      payload: { name: "New Name" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("New Name");
  });

  it("should delete an agent", async () => {
    const agent = ctx.db.createAgent({ name: "To Delete", systemPrompt: "test" });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/agents/${agent.id}`,
      headers: adminHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const check = ctx.db.getAgent(agent.id);
    expect(check).toBeNull();
  });
});
