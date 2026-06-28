import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { LLMProvider, LLMRequest, LLMResponse, LLMStreamChunk } from "@agentforge/types";
import { PostgresAdapter, type PostgresConfig } from "@agentforge/database";
import { ToolRegistryImpl, createBuiltinTools } from "@agentforge/tools";
import { SkillRegistryImpl } from "@agentforge/skills";
import { AgentLoop } from "@agentforge/core";
import { createApp } from "@agentforge/server/app";
import type { AppContext } from "@agentforge/server/bootstrap";
import type { FastifyInstance } from "fastify";

class MockProvider implements LLMProvider {
  readonly name = "mock";
  async chat(_request: LLMRequest): Promise<LLMResponse> {
    return {
      content: [{ type: "text", text: "Integration test response" }],
      stopReason: "end_turn",
      model: "mock-model",
      usage: { tokensIn: 15, tokensOut: 25 },
    };
  }
  async *stream(_request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    yield { type: "text", text: "Streaming " };
    yield { type: "text", text: "response" };
    yield { type: "done", stopReason: "end_turn", usage: { tokensIn: 15, tokensOut: 25 } };
  }
}

describe("Integration: Full Flow", () => {
  let app: FastifyInstance;
  let ctx: AppContext;
  const adminSecret = "test-admin-secret";

  beforeAll(async () => {
    const db = new PostgresAdapter(testPostgresConfig());
    await resetDatabase(db);
    await db.initialize();
    const provider = new MockProvider();
    const toolRegistry = new ToolRegistryImpl();
    for (const tool of createBuiltinTools()) {
      toolRegistry.register(tool);
    }
    const skillRegistry = new SkillRegistryImpl();
    const agentLoop = new AgentLoop({ provider, toolRegistry, skillRegistry, db });

    ctx = {
      db,
      provider,
      toolRegistry,
      skillRegistry,
      agentLoop,
      config: {
        port: 0,
        dbType: "postgres",
        database: { type: "postgres", ...testPostgresConfig() },
        llmProvider: "mock",
        llmApiKey: "test",
        defaultModel: "mock-model",
        adminSecret,
        adminEmail: "demo@example.com",
        adminPassword: "password",
        sessionTtlDays: 7,
      },
    };

    app = createApp(ctx);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    ctx.db.close();
  });

  it("should complete the full agent lifecycle", async () => {
    // 1. Create agent
    const createRes = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { "x-admin-secret": adminSecret },
      payload: {
        name: "Test Agent",
        systemPrompt: "You are a test agent.",
        model: "mock-model",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();
    expect(created.name).toBe("Test Agent");
    expect(created.apiKeys).toHaveLength(1);
    expect(created.apiKeys[0].rawKey).toBeTruthy();

    const agentId = created.id;
    const apiKey = created.apiKeys[0].rawKey;

    // 2. List agents
    const listRes = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { "x-admin-secret": adminSecret },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toHaveLength(1);

    // 3. Get agent detail
    const getRes = await app.inject({
      method: "GET",
      url: `/api/agents/${agentId}`,
      headers: { "x-admin-secret": adminSecret },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe("Test Agent");

    // 4. Send chat message
    const chatRes = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { message: "Hello!" },
    });
    expect(chatRes.statusCode).toBe(200);
    const chatData = chatRes.json();
    expect(chatData.reply).toBe("Integration test response");
    expect(chatData.sessionId).toBeTruthy();
    expect(chatData.usage.tokensIn).toBeGreaterThan(0);

    const sessionId = chatData.sessionId;

    // 5. Verify session was created
    const sessionsRes = await app.inject({
      method: "GET",
      url: "/api/sessions",
      headers: { "x-admin-secret": adminSecret },
    });
    expect(sessionsRes.statusCode).toBe(200);
    const sessions = sessionsRes.json();
    expect(sessions.length).toBeGreaterThanOrEqual(1);

    // 6. Verify messages persisted
    const msgsRes = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/messages`,
      headers: { "x-admin-secret": adminSecret },
    });
    expect(msgsRes.statusCode).toBe(200);
    const msgs = msgsRes.json();
    expect(msgs.length).toBeGreaterThanOrEqual(2); // user + assistant

    // 7. Check tools endpoint
    const toolsRes = await app.inject({
      method: "GET",
      url: "/api/tools",
      headers: { "x-admin-secret": adminSecret },
    });
    expect(toolsRes.statusCode).toBe(200);
    expect(toolsRes.json().map((tool: { name: string }) => tool.name).sort()).toEqual(["calculate", "get_time"]);

    // 8. Check stats
    const statsRes = await app.inject({
      method: "GET",
      url: "/api/stats",
      headers: { "x-admin-secret": adminSecret },
    });
    expect(statsRes.statusCode).toBe(200);
    const stats = statsRes.json();
    expect(stats.totalSessions).toBe(1);
    expect(stats.totalRequests).toBe(1);

    // 9. Check skills endpoint (read-only, loaded from filesystem)
    const skillsRes = await app.inject({
      method: "GET",
      url: "/api/skills",
      headers: { "x-admin-secret": adminSecret },
    });
    expect(skillsRes.statusCode).toBe(200);

    // 10. Update agent
    const updateRes = await app.inject({
      method: "PUT",
      url: `/api/agents/${agentId}`,
      headers: { "x-admin-secret": adminSecret },
      payload: { name: "Updated Agent" },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().name).toBe("Updated Agent");

    // 11. Delete agent (cascades)
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/agents/${agentId}`,
      headers: { "x-admin-secret": adminSecret },
    });
    expect(deleteRes.statusCode).toBe(200);

    // 12. Verify agent deleted
    const finalList = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { "x-admin-secret": adminSecret },
    });
    expect(finalList.json()).toHaveLength(0);
  });
});

function testPostgresConfig(): PostgresConfig {
  const value = process.env.POSTGRES_TEST_URL ?? process.env.DATABASE_URL;
  if (!value) throw new Error("POSTGRES_TEST_URL is required for integration tests");
  const url = new URL(value);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}

async function resetDatabase(db: PostgresAdapter): Promise<void> {
  const pool = (db as unknown as { pool: { query(sql: string): Promise<unknown> } }).pool;
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
}
