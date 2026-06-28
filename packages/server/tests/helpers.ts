import { ProviderRegistry, type AppContext } from "../src/bootstrap.js";
import type { LLMProvider, LLMRequest, LLMResponse, LLMStreamChunk } from "@agentforge/types";
import { PostgresAdapter, type PostgresConfig } from "@agentforge/database";
import { ToolRegistryImpl, createBuiltinTools } from "@agentforge/tools";
import { SkillRegistryImpl } from "@agentforge/skills";
import { AgentLoop } from "@agentforge/core";
import type { AppConfig } from "../src/config.js";
import { createApp } from "../src/app.js";

class MockProvider implements LLMProvider {
  readonly name = "mock";

  async chat(_request: LLMRequest): Promise<LLMResponse> {
    return {
      content: [{ type: "text", text: "Hello from mock provider" }],
      stopReason: "end_turn",
      model: "mock-model",
      usage: { tokensIn: 10, tokensOut: 20 },
    };
  }

  async *stream(_request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    yield { type: "text", text: "Hello from mock" };
    yield { type: "done", stopReason: "end_turn", usage: { tokensIn: 10, tokensOut: 20 } };
  }
}

export function createTestConfig(): AppConfig {
  const database = testPostgresConfig();
  return {
    port: 0,
    dbType: "postgres",
    database: { type: "postgres", ...database },
    llmProvider: "mock",
    llmApiKey: "test-key",
    defaultModel: "mock-model",
    adminSecret: "test-secret",
    adminEmail: "demo@example.com",
    adminPassword: "password",
    sessionTtlDays: 7,
    publicUrl: "http://localhost",
  };
}

export async function createTestContext(): Promise<AppContext> {
  const config = createTestConfig();
  const db = new PostgresAdapter(config.database);
  await resetDatabase(db);
  await db.initialize();
  const provider = new MockProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register("mock-provider", provider, true, "mock-model");
  const toolRegistry = new ToolRegistryImpl();
  for (const tool of createBuiltinTools()) {
    toolRegistry.register(tool);
  }
  const skillRegistry = new SkillRegistryImpl();
  const agentLoop = new AgentLoop({ provider, toolRegistry, skillRegistry, db });

  return { db, providerRegistry, toolRegistry, skillRegistry, agentLoop, config };
}

function testPostgresConfig(): PostgresConfig {
  const value = process.env.POSTGRES_TEST_URL ?? process.env.DATABASE_URL;
  if (!value) throw new Error("POSTGRES_TEST_URL is required for server tests");
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

export async function createTestApp() {
  const ctx = await createTestContext();
  const app = createApp(ctx);
  return { app, ctx };
}
