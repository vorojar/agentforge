import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { SQLiteAdapter } from "../src/sqlite.js";

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

describe("SQLiteAdapter", () => {
  let db: SQLiteAdapter;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
  });

  // --- Agent CRUD ---

  describe("Agents", () => {
    it("should create an agent with defaults", async () => {
      const agent = await db.createAgent({
        name: "Test Agent",
        systemPrompt: "You are a test agent.",
      });
      expect(agent.id).toBeDefined();
      expect(agent.name).toBe("Test Agent");
      expect(agent.systemPrompt).toBe("You are a test agent.");
      expect(agent.model).toBe("claude-sonnet-4-20250514");
      expect(agent.temperature).toBe(0.7);
      expect(agent.maxTokens).toBe(4096);
      expect(agent.maxIterations).toBe(15);
      expect(agent.streaming).toBe(false);
      expect(agent.thinking).toBe(false);
      expect(agent.tools).toEqual([]);
      expect(agent.skills).toEqual([]);
      expect(agent.enabled).toBe(true);
      expect(agent.createdAt).toBeDefined();
      expect(agent.updatedAt).toBeDefined();
    });

    it("should create an agent with custom values", async () => {
      const agent = await db.createAgent({
        name: "Custom Agent",
        description: "A custom agent",
        systemPrompt: "Custom prompt",
        model: "gpt-4",
        fallbackModels: [{ providerId: "provider-2", model: "gpt-4o-mini" }],
        fallbackCooldownSeconds: 120,
        category: " support ",
        temperature: 0.5,
        maxTokens: 2048,
        maxIterations: 10,
        streaming: true,
        thinking: true,
        tools: ["weather", "calculator"],
        skills: ["code-review"],
      });
      expect(agent.name).toBe("Custom Agent");
      expect(agent.description).toBe("A custom agent");
      expect(agent.model).toBe("gpt-4");
      expect(agent.fallbackModels).toEqual([{ providerId: "provider-2", model: "gpt-4o-mini" }]);
      expect(agent.fallbackCooldownSeconds).toBe(120);
      expect(agent.category).toBe("support");
      expect(agent.temperature).toBe(0.5);
      expect(agent.maxTokens).toBe(2048);
      expect(agent.maxIterations).toBe(10);
      expect(agent.streaming).toBe(true);
      expect(agent.thinking).toBe(true);
      expect(agent.tools).toEqual(["weather", "calculator"]);
      expect(agent.skills).toEqual(["code-review"]);
    });

    it("should get an agent by id", async () => {
      const created = await db.createAgent({ name: "A", systemPrompt: "P" });
      const fetched = await db.getAgent(created.id);
      expect(fetched).toEqual(created);
    });

    it("should return null for non-existent agent", async () => {
      expect(await db.getAgent("non-existent")).toBeNull();
    });

    it("should list agents", async () => {
      await db.createAgent({ name: "A1", systemPrompt: "P1" });
      await db.createAgent({ name: "A2", systemPrompt: "P2" });
      const agents = await db.listAgents();
      expect(agents).toHaveLength(2);
    });

    it("should update an agent", async () => {
      const agent = await db.createAgent({ name: "Old", systemPrompt: "P" });
      const updated = await db.updateAgent(agent.id, {
        name: "New",
        temperature: 0.9,
        fallbackModels: [{ providerId: "provider-2", model: "fallback-model" }],
        category: " ops ",
      });
      expect(updated!.name).toBe("New");
      expect(updated!.temperature).toBe(0.9);
      expect(updated!.fallbackModels).toEqual([{ providerId: "provider-2", model: "fallback-model" }]);
      expect(updated!.category).toBe("ops");
      expect(updated!.systemPrompt).toBe("P");
    });

    it("should return null when updating non-existent agent", async () => {
      expect(await db.updateAgent("non-existent", { name: "X" })).toBeNull();
    });

    it("should delete an agent", async () => {
      const agent = await db.createAgent({ name: "Delete Me", systemPrompt: "P" });
      expect(await db.deleteAgent(agent.id)).toBe(true);
      expect(await db.getAgent(agent.id)).toBeNull();
    });

    it("should return false when deleting non-existent agent", async () => {
      expect(await db.deleteAgent("non-existent")).toBe(false);
    });
  });

  // --- API Key Operations ---

  describe("API Keys", () => {
    let agentId: string;

    beforeEach(async () => {
      const agent = await db.createAgent({ name: "Key Agent", systemPrompt: "P" });
      agentId = agent.id;
    });

    it("should create an API key", async () => {
      const { apiKey, rawKey } = await db.createApiKey(agentId);
      expect(rawKey).toMatch(/^af-[0-9a-f]{24}$/);
      expect(apiKey.keyPrefix).toBe(rawKey.slice(0, 8));
      expect(apiKey.agentId).toBe(agentId);
      expect(apiKey.name).toBe("default");
      expect(apiKey.enabled).toBe(true);
      expect(apiKey.lastUsedAt).toBeNull();
    });

    it("should create an API key with a custom name", async () => {
      const { apiKey } = await db.createApiKey(agentId, "production");
      expect(apiKey.name).toBe("production");
    });

    it("should look up an API key by hash", async () => {
      const { rawKey } = await db.createApiKey(agentId);
      const hash = hashKey(rawKey);
      const found = await db.getApiKeyByHash(hash);
      expect(found).not.toBeNull();
      expect(found!.agentId).toBe(agentId);
    });

    it("should return null for unknown hash", async () => {
      expect(await db.getApiKeyByHash("unknown-hash")).toBeNull();
    });

    it("should list API keys for an agent", async () => {
      await db.createApiKey(agentId, "key1");
      await db.createApiKey(agentId, "key2");
      const keys = await db.listApiKeys(agentId);
      expect(keys).toHaveLength(2);
    });

    it("should list all API keys", async () => {
      const agent2 = await db.createAgent({ name: "Agent2", systemPrompt: "P2" });
      await db.createApiKey(agentId, "k1");
      await db.createApiKey(agent2.id, "k2");
      const allKeys = await db.listAllApiKeys();
      expect(allKeys).toHaveLength(2);
    });

    it("should delete an API key", async () => {
      const { apiKey } = await db.createApiKey(agentId);
      expect(await db.deleteApiKey(apiKey.id)).toBe(true);
      expect(await db.listApiKeys(agentId)).toHaveLength(0);
    });

    it("should touch an API key (update last_used_at)", async () => {
      const { apiKey } = await db.createApiKey(agentId);
      expect(apiKey.lastUsedAt).toBeNull();
      await db.touchApiKey(apiKey.id);
      const found = await db.getApiKeyByHash(apiKey.keyHash);
      expect(found!.lastUsedAt).not.toBeNull();
    });
  });

  // --- Session Operations ---

  describe("Sessions", () => {
    let agentId: string;

    beforeEach(async () => {
      const agent = await db.createAgent({ name: "Session Agent", systemPrompt: "P" });
      agentId = agent.id;
    });

    it("should create a session", async () => {
      const session = await db.createSession(agentId);
      expect(session.id).toBeDefined();
      expect(session.agentId).toBe(agentId);
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
    });

    it("should get a session by id", async () => {
      const created = await db.createSession(agentId);
      const fetched = await db.getSession(created.id);
      expect(fetched).toEqual(created);
    });

    it("should create rerun sessions in the same family", async () => {
      const root = await db.createSession(agentId);
      const rerun = await db.createSession(agentId, { sourceSessionId: root.id });
      expect(rerun.rootSessionId).toBe(root.id);
      expect(rerun.sourceSessionId).toBe(root.id);
      const family = await db.listSessionFamily(root.id);
      expect(family.map(session => session.id)).toEqual([root.id, rerun.id]);
    });

    it("should return null for non-existent session", async () => {
      expect(await db.getSession("non-existent")).toBeNull();
    });

    it("should list sessions for an agent", async () => {
      await db.createSession(agentId);
      await db.createSession(agentId);
      const sessions = await db.listSessions(agentId);
      expect(sessions).toHaveLength(2);
    });

    it("should list all sessions when no agentId given", async () => {
      const agent2 = await db.createAgent({ name: "Agent2", systemPrompt: "P2" });
      await db.createSession(agentId);
      await db.createSession(agent2.id);
      const sessions = await db.listSessions();
      expect(sessions).toHaveLength(2);
    });

    it("should delete a session", async () => {
      const session = await db.createSession(agentId);
      expect(await db.deleteSession(session.id)).toBe(true);
      expect(await db.getSession(session.id)).toBeNull();
    });

    it("should return false when deleting non-existent session", async () => {
      expect(await db.deleteSession("non-existent")).toBe(false);
    });
  });

  // --- Message Operations ---

  describe("Messages", () => {
    let sessionId: string;

    beforeEach(async () => {
      const agent = await db.createAgent({ name: "Msg Agent", systemPrompt: "P" });
      const session = await db.createSession(agent.id);
      sessionId = session.id;
    });

    it("should add a text message", async () => {
      const msg = await db.addMessage({
        sessionId,
        role: "user",
        content: "Hello!",
      });
      expect(msg.id).toBeDefined();
      expect(msg.sessionId).toBe(sessionId);
      expect(msg.role).toBe("user");
      expect(msg.content).toBe("Hello!");
      expect(msg.createdAt).toBeDefined();
    });

    it("should add a message with ContentBlock array", async () => {
      const blocks = [
        { type: "text" as const, text: "Here is the result" },
      ];
      const msg = await db.addMessage({
        sessionId,
        role: "assistant",
        content: blocks,
        model: "claude-sonnet-4-20250514",
        tokensIn: 100,
        tokensOut: 50,
      });
      expect(msg.content).toEqual(blocks);
    });

    it("should add a message with thinking", async () => {
      const msg = await db.addMessage({
        sessionId,
        role: "assistant",
        content: "Answer",
        thinking: "Let me think about this...",
      });
      expect(msg.thinking).toBe("Let me think about this...");
    });

    it("should add a message with model trace", async () => {
      const modelTrace = {
        requestedModel: "primary-model",
        selectedProviderId: "backup",
        selectedModel: "backup-model",
        fallbackUsed: true,
        attempts: [
          { providerId: "primary", model: "primary-model", attempt: 1, status: "failed" as const, error: "timeout" },
          { providerId: "backup", model: "backup-model", attempt: 1, status: "success" as const },
        ],
      };
      await db.addMessage({
        sessionId,
        role: "assistant",
        content: "Answer",
        model: "backup-model",
        modelTrace,
      });

      const messages = await db.getMessages(sessionId);
      expect(messages[0].modelTrace).toEqual(modelTrace);
    });

    it("should get messages for a session in order", async () => {
      await db.addMessage({ sessionId, role: "user", content: "First" });
      await db.addMessage({ sessionId, role: "assistant", content: "Second" });
      const messages = await db.getMessages(sessionId);
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe("First");
      expect(messages[1].content).toBe("Second");
    });

    it("should return empty array for session with no messages", async () => {
      expect(await db.getMessages(sessionId)).toEqual([]);
    });
  });

  // --- Usage Logging and Stats ---

  describe("Usage", () => {
    let agentId: string;

    beforeEach(async () => {
      const agent = await db.createAgent({ name: "Usage Agent", systemPrompt: "P" });
      agentId = agent.id;
    });

    it("should log usage", async () => {
      await db.logUsage({
        agentId,
        sessionId: "s1",
        tokensIn: 100,
        tokensOut: 200,
        model: "claude-sonnet-4-20250514",
        durationMs: 500,
      });
      const stats = await db.getUsageStats(agentId);
      expect(stats.totalTokensIn).toBe(100);
      expect(stats.totalTokensOut).toBe(200);
      expect(stats.totalRequests).toBe(1);
    });

    it("should aggregate usage stats", async () => {
      await db.logUsage({ agentId, sessionId: "s1", tokensIn: 100, tokensOut: 200, model: "m1", durationMs: 100 });
      await db.logUsage({ agentId, sessionId: "s2", tokensIn: 150, tokensOut: 300, model: "m1", durationMs: 200 });
      const stats = await db.getUsageStats(agentId);
      expect(stats.totalTokensIn).toBe(250);
      expect(stats.totalTokensOut).toBe(500);
      expect(stats.totalRequests).toBe(2);
    });

    it("should get global usage stats when no agentId", async () => {
      const agent2 = await db.createAgent({ name: "A2", systemPrompt: "P2" });
      await db.logUsage({ agentId, sessionId: "s1", tokensIn: 100, tokensOut: 200, model: "m1", durationMs: 100 });
      await db.logUsage({ agentId: agent2.id, sessionId: "s2", tokensIn: 50, tokensOut: 80, model: "m1", durationMs: 50 });
      const stats = await db.getUsageStats();
      expect(stats.totalTokensIn).toBe(150);
      expect(stats.totalTokensOut).toBe(280);
      expect(stats.totalRequests).toBe(2);
    });

    it("should return zero stats when no usage", async () => {
      const stats = await db.getUsageStats(agentId);
      expect(stats.totalTokensIn).toBe(0);
      expect(stats.totalTokensOut).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });

    it("should get daily stats", async () => {
      await db.logUsage({ agentId, sessionId: "s1", tokensIn: 100, tokensOut: 200, model: "m1", durationMs: 100 });
      const daily = await db.getDailyStats(agentId, 7);
      expect(daily.length).toBeGreaterThanOrEqual(1);
      expect(daily[0].tokensIn).toBe(100);
      expect(daily[0].tokensOut).toBe(200);
      expect(daily[0].requests).toBe(1);
    });

    it("should get daily stats without agentId filter", async () => {
      await db.logUsage({ agentId, sessionId: "s1", tokensIn: 100, tokensOut: 200, model: "m1", durationMs: 100 });
      const daily = await db.getDailyStats(undefined, 7);
      expect(daily.length).toBeGreaterThanOrEqual(1);
    });

    it("should get model stats", async () => {
      await db.logUsage({ agentId, sessionId: "s1", tokensIn: 100, tokensOut: 200, model: "gpt-4", durationMs: 100 });
      await db.logUsage({ agentId, sessionId: "s2", tokensIn: 50, tokensOut: 80, model: "claude", durationMs: 50 });
      const stats = await db.getModelStats();
      expect(stats).toHaveLength(2);
    });

    it("should get agent usage stats", async () => {
      await db.logUsage({ agentId, sessionId: "s1", tokensIn: 100, tokensOut: 200, model: "m1", durationMs: 100 });
      const stats = await db.getAgentUsageStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].agentId).toBe(agentId);
    });
  });

  // --- Cascade Deletes ---

  describe("Cascade Deletes", () => {
    it("should delete API keys when agent is deleted", async () => {
      const agent = await db.createAgent({ name: "Cascade", systemPrompt: "P" });
      await db.createApiKey(agent.id, "k1");
      await db.createApiKey(agent.id, "k2");
      expect(await db.listApiKeys(agent.id)).toHaveLength(2);
      await db.deleteAgent(agent.id);
      expect(await db.listApiKeys(agent.id)).toHaveLength(0);
    });

    it("should delete sessions when agent is deleted", async () => {
      const agent = await db.createAgent({ name: "Cascade", systemPrompt: "P" });
      await db.createSession(agent.id);
      await db.createSession(agent.id);
      expect(await db.listSessions(agent.id)).toHaveLength(2);
      await db.deleteAgent(agent.id);
      expect(await db.listSessions(agent.id)).toHaveLength(0);
    });

    it("should delete messages when session is deleted", async () => {
      const agent = await db.createAgent({ name: "Cascade", systemPrompt: "P" });
      const session = await db.createSession(agent.id);
      await db.addMessage({ sessionId: session.id, role: "user", content: "Hi" });
      await db.addMessage({ sessionId: session.id, role: "assistant", content: "Hello" });
      expect(await db.getMessages(session.id)).toHaveLength(2);
      await db.deleteSession(session.id);
      expect(await db.getMessages(session.id)).toHaveLength(0);
    });

    it("should cascade delete messages through agent → session", async () => {
      const agent = await db.createAgent({ name: "Cascade", systemPrompt: "P" });
      const session = await db.createSession(agent.id);
      await db.addMessage({ sessionId: session.id, role: "user", content: "Hi" });
      await db.deleteAgent(agent.id);
      expect(await db.getMessages(session.id)).toHaveLength(0);
    });
  });

  // --- HTTP Tool CRUD ---

  describe("HTTP Tools", () => {
    it("should create an HTTP tool with defaults", async () => {
      const tool = await db.createHttpTool({
        name: "query_order",
        url: "https://api.example.com/orders/{orderId}",
      });
      expect(tool.id).toBeDefined();
      expect(tool.name).toBe("query_order");
      expect(tool.description).toBe("");
      expect(tool.method).toBe("GET");
      expect(tool.url).toBe("https://api.example.com/orders/{orderId}");
      expect(tool.headers).toEqual({});
      expect(tool.parameters).toEqual({ type: "object", properties: {} });
      expect(tool.bodyTemplate).toBe("");
      expect(tool.enabled).toBe(true);
    });

    it("should create an HTTP tool with custom values", async () => {
      const tool = await db.createHttpTool({
        name: "create_order",
        description: "Create a new order",
        method: "POST",
        url: "https://api.example.com/orders",
        headers: { Authorization: "Bearer token123" },
        parameters: {
          type: "object",
          properties: { item: { type: "string" }, quantity: { type: "number" } },
          required: ["item"],
        },
        bodyTemplate: '{"item": "{item}", "qty": {quantity}}',
        category: " orders ",
      });
      expect(tool.name).toBe("create_order");
      expect(tool.method).toBe("POST");
      expect(tool.headers).toEqual({ Authorization: "Bearer token123" });
      expect(tool.parameters.required).toEqual(["item"]);
      expect(tool.category).toBe("orders");
    });

    it("should store skill categories separately from skill files", async () => {
      expect(await db.listSkillCategories()).toEqual({});
      await db.setSkillCategory("code-review", "engineering");
      expect(await db.listSkillCategories()).toEqual({ "code-review": "engineering" });
      await db.setSkillCategory("code-review", "");
      expect(await db.listSkillCategories()).toEqual({});
    });

    it("should get an HTTP tool by id", async () => {
      const created = await db.createHttpTool({ name: "t1", url: "https://example.com" });
      const fetched = await db.getHttpTool(created.id);
      expect(fetched).toEqual(created);
    });

    it("should return null for non-existent HTTP tool", async () => {
      expect(await db.getHttpTool("non-existent")).toBeNull();
    });

    it("should list HTTP tools", async () => {
      await db.createHttpTool({ name: "t1", url: "https://example.com/1" });
      await db.createHttpTool({ name: "t2", url: "https://example.com/2" });
      const tools = await db.listHttpTools();
      expect(tools).toHaveLength(2);
    });

    it("should update an HTTP tool", async () => {
      const tool = await db.createHttpTool({ name: "old_name", url: "https://old.com" });
      const updated = await db.updateHttpTool(tool.id, {
        name: "new_name",
        method: "POST",
        enabled: false,
      });
      expect(updated!.name).toBe("new_name");
      expect(updated!.method).toBe("POST");
      expect(updated!.enabled).toBe(false);
      expect(updated!.url).toBe("https://old.com");
    });

    it("should return null when updating non-existent HTTP tool", async () => {
      expect(await db.updateHttpTool("non-existent", { name: "X" })).toBeNull();
    });

    it("should delete an HTTP tool", async () => {
      const tool = await db.createHttpTool({ name: "del_me", url: "https://example.com" });
      expect(await db.deleteHttpTool(tool.id)).toBe(true);
      expect(await db.getHttpTool(tool.id)).toBeNull();
    });

    it("should return false when deleting non-existent HTTP tool", async () => {
      expect(await db.deleteHttpTool("non-existent")).toBe(false);
    });
  });

  // --- Knowledge Bases ---

  describe("Knowledge Bases", () => {
    it("should create a knowledge base", async () => {
      const kb = await db.createKnowledgeBase({ name: "Test KB", description: "A test KB" });
      expect(kb.id).toBeDefined();
      expect(kb.name).toBe("Test KB");
      expect(kb.description).toBe("A test KB");
    });

    it("should list knowledge bases", async () => {
      await db.createKnowledgeBase({ name: "KB1" });
      await db.createKnowledgeBase({ name: "KB2" });
      const kbs = await db.listKnowledgeBases();
      expect(kbs).toHaveLength(2);
    });

    it("should update a knowledge base", async () => {
      const kb = await db.createKnowledgeBase({ name: "Old" });
      const updated = await db.updateKnowledgeBase(kb.id, { name: "New" });
      expect(updated!.name).toBe("New");
    });

    it("should delete a knowledge base", async () => {
      const kb = await db.createKnowledgeBase({ name: "Del" });
      expect(await db.deleteKnowledgeBase(kb.id)).toBe(true);
      expect(await db.getKnowledgeBase(kb.id)).toBeNull();
    });
  });

  // --- Agent-Knowledge ---

  describe("Agent-Knowledge Association", () => {
    it("should set and get agent knowledge", async () => {
      const agent = await db.createAgent({ name: "A", systemPrompt: "P" });
      const kb1 = await db.createKnowledgeBase({ name: "KB1" });
      const kb2 = await db.createKnowledgeBase({ name: "KB2" });
      await db.setAgentKnowledge(agent.id, [kb1.id, kb2.id]);
      const kbIds = await db.getAgentKnowledge(agent.id);
      expect(kbIds).toHaveLength(2);
      expect(kbIds).toContain(kb1.id);
      expect(kbIds).toContain(kb2.id);
    });
  });

  // --- Knowledge Ingestion & Search ---

  describe("Knowledge Search", () => {
    it("should ingest and search knowledge", async () => {
      const kb = await db.createKnowledgeBase({ name: "KB" });
      await db.ingestKnowledge(kb.id, "doc.txt", "Full raw text about TypeScript", ["TypeScript is a typed language", "It compiles to JavaScript"]);
      const results = await db.searchKnowledge([kb.id], "TypeScript");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].content).toContain("TypeScript");
    });

    it("should list knowledge sources", async () => {
      const kb = await db.createKnowledgeBase({ name: "KB" });
      await db.ingestKnowledge(kb.id, "doc1.txt", "raw1", ["chunk1"]);
      await db.ingestKnowledge(kb.id, "doc2.txt", "raw2", ["chunk2"]);
      const sources = await db.listKnowledgeSources(kb.id);
      expect(sources).toHaveLength(2);
    });

    it("should get knowledge source content", async () => {
      const kb = await db.createKnowledgeBase({ name: "KB" });
      await db.ingestKnowledge(kb.id, "doc.txt", "Full raw content here", ["chunk"]);
      const content = await db.getKnowledgeSourceContent(kb.id, "doc.txt");
      expect(content).toBe("Full raw content here");
    });

    it("should rename a knowledge source", async () => {
      const kb = await db.createKnowledgeBase({ name: "KB" });
      await db.ingestKnowledge(kb.id, "old.txt", "raw", ["chunk"]);
      expect(await db.renameKnowledgeSource(kb.id, "old.txt", "new.txt")).toBe(true);
      const sources = await db.listKnowledgeSources(kb.id);
      expect(sources[0].sourceName).toBe("new.txt");
    });

    it("should delete a knowledge source", async () => {
      const kb = await db.createKnowledgeBase({ name: "KB" });
      await db.ingestKnowledge(kb.id, "doc.txt", "raw", ["chunk"]);
      expect(await db.deleteKnowledgeSource(kb.id, "doc.txt")).toBe(true);
      expect(await db.listKnowledgeSources(kb.id)).toHaveLength(0);
    });
  });

  // --- Providers ---

  describe("Providers", () => {
    it("should create a provider with default capabilities", async () => {
      const provider = await db.createProvider({
        name: "Claude",
        type: "claude",
        apiKey: "sk-test",
        defaultModel: "claude-sonnet",
      });

      expect(provider.capabilities).toEqual({
        supportsTools: true,
        supportsVision: true,
        supportsThinking: true,
        supportsStreaming: true,
      });
    });

    it("should update provider capabilities", async () => {
      const provider = await db.createProvider({
        name: "Text only",
        type: "openai",
        apiKey: "sk-test",
        defaultModel: "text-model",
      });

      const updated = await db.updateProvider(provider.id, {
        capabilities: {
          supportsVision: false,
          supportsThinking: true,
        },
      });

      expect(updated!.capabilities).toEqual({
        supportsTools: true,
        supportsVision: false,
        supportsThinking: true,
        supportsStreaming: true,
      });
    });
  });

  // --- Provider Channels ---

  describe("Provider Channels", () => {
    let providerId: string;

    beforeEach(async () => {
      const provider = await db.createProvider({
        name: "Test Provider",
        type: "openai",
        apiKey: "sk-test",
        defaultModel: "gpt-4",
      });
      providerId = provider.id;
    });

    it("should create a channel", async () => {
      const { channel, rawKey } = await db.createChannel(providerId, "test-channel");
      expect(channel.id).toBeDefined();
      expect(channel.name).toBe("test-channel");
      expect(rawKey).toMatch(/^af-ch-/);
    });

    it("should get channel by hash", async () => {
      const { rawKey } = await db.createChannel(providerId, "ch");
      const hash = hashKey(rawKey);
      const found = await db.getChannelByHash(hash);
      expect(found).not.toBeNull();
      expect(found!.providerConfig).toBeDefined();
      expect(found!.providerConfig.id).toBe(providerId);
    });

    it("should list channels", async () => {
      await db.createChannel(providerId, "ch1");
      await db.createChannel(providerId, "ch2");
      const channels = await db.listChannels(providerId);
      expect(channels).toHaveLength(2);
    });

    it("should delete a channel", async () => {
      const { channel } = await db.createChannel(providerId, "ch");
      expect(await db.deleteChannel(channel.id)).toBe(true);
      expect(await db.listChannels(providerId)).toHaveLength(0);
    });
  });

  // --- createDatabase factory ---

  describe("createDatabase", () => {
    it("should create SQLiteAdapter via factory", async () => {
      const { createDatabase } = await import("../src/index.js");
      const adapter = await createDatabase(":memory:");
      expect(adapter).toBeInstanceOf(SQLiteAdapter);
      await adapter.close();
    });
  });
});
