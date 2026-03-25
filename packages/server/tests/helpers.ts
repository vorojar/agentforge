import type { AppContext } from "../src/bootstrap.js";
import type { LLMProvider, LLMRequest, LLMResponse, LLMStreamChunk } from "@agentforge/types";
import { SQLiteAdapter } from "@agentforge/database";
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
  return {
    port: 0,
    databaseType: "sqlite",
    databaseUrl: ":memory:",
    llmProvider: "mock",
    llmApiKey: "test-key",
    defaultModel: "mock-model",
    adminSecret: "test-secret",
  };
}

export function createTestContext(): AppContext {
  const config = createTestConfig();
  const db = new SQLiteAdapter(":memory:");
  const provider = new MockProvider();
  const toolRegistry = new ToolRegistryImpl();
  for (const tool of createBuiltinTools()) {
    toolRegistry.register(tool);
  }
  const skillRegistry = new SkillRegistryImpl();
  const agentLoop = new AgentLoop({ provider, toolRegistry, skillRegistry, db });

  return { db, provider, toolRegistry, skillRegistry, agentLoop, config };
}

export function createTestApp() {
  const ctx = createTestContext();
  const app = createApp(ctx);
  return { app, ctx };
}
