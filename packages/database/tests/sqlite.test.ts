import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { SQLiteAdapter } from "../src/sqlite.js";

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

describe("SQLiteAdapter", () => {
  let db: SQLiteAdapter;

  beforeEach(() => {
    db = new SQLiteAdapter(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  // --- Agent CRUD ---

  describe("Agents", () => {
    it("should create an agent with defaults", () => {
      const agent = db.createAgent({
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
      expect(agent.tools).toEqual([]);
      expect(agent.skills).toEqual([]);
      expect(agent.enabled).toBe(true);
      expect(agent.createdAt).toBeDefined();
      expect(agent.updatedAt).toBeDefined();
    });

    it("should create an agent with custom values", () => {
      const agent = db.createAgent({
        name: "Custom Agent",
        description: "A custom agent",
        systemPrompt: "Custom prompt",
        model: "gpt-4",
        temperature: 0.5,
        maxTokens: 2048,
        maxIterations: 10,
        streaming: true,
        tools: ["weather", "calculator"],
        skills: ["code-review"],
      });
      expect(agent.name).toBe("Custom Agent");
      expect(agent.description).toBe("A custom agent");
      expect(agent.model).toBe("gpt-4");
      expect(agent.temperature).toBe(0.5);
      expect(agent.maxTokens).toBe(2048);
      expect(agent.maxIterations).toBe(10);
      expect(agent.streaming).toBe(true);
      expect(agent.tools).toEqual(["weather", "calculator"]);
      expect(agent.skills).toEqual(["code-review"]);
    });

    it("should get an agent by id", () => {
      const created = db.createAgent({ name: "A", systemPrompt: "P" });
      const fetched = db.getAgent(created.id);
      expect(fetched).toEqual(created);
    });

    it("should return null for non-existent agent", () => {
      expect(db.getAgent("non-existent")).toBeNull();
    });

    it("should list agents", () => {
      db.createAgent({ name: "A1", systemPrompt: "P1" });
      db.createAgent({ name: "A2", systemPrompt: "P2" });
      const agents = db.listAgents();
      expect(agents).toHaveLength(2);
    });

    it("should update an agent", () => {
      const agent = db.createAgent({ name: "Old", systemPrompt: "P" });
      const updated = db.updateAgent(agent.id, { name: "New", temperature: 0.9 });
      expect(updated!.name).toBe("New");
      expect(updated!.temperature).toBe(0.9);
      expect(updated!.systemPrompt).toBe("P");
    });

    it("should return null when updating non-existent agent", () => {
      expect(db.updateAgent("non-existent", { name: "X" })).toBeNull();
    });

    it("should delete an agent", () => {
      const agent = db.createAgent({ name: "Delete Me", systemPrompt: "P" });
      expect(db.deleteAgent(agent.id)).toBe(true);
      expect(db.getAgent(agent.id)).toBeNull();
    });

    it("should return false when deleting non-existent agent", () => {
      expect(db.deleteAgent("non-existent")).toBe(false);
    });
  });

  // --- API Key Operations ---

  describe("API Keys", () => {
    let agentId: string;

    beforeEach(() => {
      const agent = db.createAgent({ name: "Key Agent", systemPrompt: "P" });
      agentId = agent.id;
    });

    it("should create an API key", () => {
      const { apiKey, rawKey } = db.createApiKey(agentId);
      expect(rawKey).toMatch(/^af-[0-9a-f]{24}$/);
      expect(apiKey.keyPrefix).toBe(rawKey.slice(0, 8));
      expect(apiKey.agentId).toBe(agentId);
      expect(apiKey.name).toBe("default");
      expect(apiKey.enabled).toBe(true);
      expect(apiKey.lastUsedAt).toBeNull();
    });

    it("should create an API key with a custom name", () => {
      const { apiKey } = db.createApiKey(agentId, "production");
      expect(apiKey.name).toBe("production");
    });

    it("should look up an API key by hash", () => {
      const { rawKey } = db.createApiKey(agentId);
      const hash = hashKey(rawKey);
      const found = db.getApiKeyByHash(hash);
      expect(found).not.toBeNull();
      expect(found!.agentId).toBe(agentId);
    });

    it("should return null for unknown hash", () => {
      expect(db.getApiKeyByHash("unknown-hash")).toBeNull();
    });

    it("should list API keys for an agent", () => {
      db.createApiKey(agentId, "key1");
      db.createApiKey(agentId, "key2");
      const keys = db.listApiKeys(agentId);
      expect(keys).toHaveLength(2);
    });

    it("should delete an API key", () => {
      const { apiKey } = db.createApiKey(agentId);
      expect(db.deleteApiKey(apiKey.id)).toBe(true);
      expect(db.listApiKeys(agentId)).toHaveLength(0);
    });

    it("should touch an API key (update last_used_at)", () => {
      const { apiKey } = db.createApiKey(agentId);
      expect(apiKey.lastUsedAt).toBeNull();
      db.touchApiKey(apiKey.id);
      const found = db.getApiKeyByHash(apiKey.keyHash);
      expect(found!.lastUsedAt).not.toBeNull();
    });
  });

  // --- Session Operations ---

  describe("Sessions", () => {
    let agentId: string;

    beforeEach(() => {
      const agent = db.createAgent({ name: "Session Agent", systemPrompt: "P" });
      agentId = agent.id;
    });

    it("should create a session", () => {
      const session = db.createSession(agentId);
      expect(session.id).toBeDefined();
      expect(session.agentId).toBe(agentId);
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
    });

    it("should get a session by id", () => {
      const created = db.createSession(agentId);
      const fetched = db.getSession(created.id);
      expect(fetched).toEqual(created);
    });

    it("should return null for non-existent session", () => {
      expect(db.getSession("non-existent")).toBeNull();
    });

    it("should list sessions for an agent", () => {
      db.createSession(agentId);
      db.createSession(agentId);
      const sessions = db.listSessions(agentId);
      expect(sessions).toHaveLength(2);
    });

    it("should list all sessions when no agentId given", () => {
      const agent2 = db.createAgent({ name: "Agent2", systemPrompt: "P2" });
      db.createSession(agentId);
      db.createSession(agent2.id);
      const sessions = db.listSessions();
      expect(sessions).toHaveLength(2);
    });

    it("should delete a session", () => {
      const session = db.createSession(agentId);
      expect(db.deleteSession(session.id)).toBe(true);
      expect(db.getSession(session.id)).toBeNull();
    });

    it("should return false when deleting non-existent session", () => {
      expect(db.deleteSession("non-existent")).toBe(false);
    });
  });

  // --- Message Operations ---

  describe("Messages", () => {
    let agentId: string;
    let sessionId: string;

    beforeEach(() => {
      const agent = db.createAgent({ name: "Msg Agent", systemPrompt: "P" });
      agentId = agent.id;
      const session = db.createSession(agentId);
      sessionId = session.id;
    });

    it("should add a text message", () => {
      const msg = db.addMessage({
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

    it("should add a message with ContentBlock array", () => {
      const blocks = [
        { type: "text" as const, text: "Here is the result" },
      ];
      const msg = db.addMessage({
        sessionId,
        role: "assistant",
        content: blocks,
        model: "claude-sonnet-4-20250514",
        tokensIn: 100,
        tokensOut: 50,
      });
      expect(msg.content).toEqual(blocks);
    });

    it("should get messages for a session in order", () => {
      db.addMessage({ sessionId, role: "user", content: "First" });
      db.addMessage({ sessionId, role: "assistant", content: "Second" });
      const messages = db.getMessages(sessionId);
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe("First");
      expect(messages[1].content).toBe("Second");
    });

    it("should return empty array for session with no messages", () => {
      expect(db.getMessages(sessionId)).toEqual([]);
    });
  });

  // --- Usage Logging and Stats ---

  describe("Usage", () => {
    let agentId: string;

    beforeEach(() => {
      const agent = db.createAgent({ name: "Usage Agent", systemPrompt: "P" });
      agentId = agent.id;
    });

    it("should log usage", () => {
      db.logUsage({
        agentId,
        sessionId: "s1",
        tokensIn: 100,
        tokensOut: 200,
        model: "claude-sonnet-4-20250514",
        durationMs: 500,
      });
      const stats = db.getUsageStats(agentId);
      expect(stats.totalTokensIn).toBe(100);
      expect(stats.totalTokensOut).toBe(200);
      expect(stats.totalRequests).toBe(1);
    });

    it("should aggregate usage stats", () => {
      db.logUsage({ agentId, sessionId: "s1", tokensIn: 100, tokensOut: 200, model: "m1", durationMs: 100 });
      db.logUsage({ agentId, sessionId: "s2", tokensIn: 150, tokensOut: 300, model: "m1", durationMs: 200 });
      const stats = db.getUsageStats(agentId);
      expect(stats.totalTokensIn).toBe(250);
      expect(stats.totalTokensOut).toBe(500);
      expect(stats.totalRequests).toBe(2);
    });

    it("should get global usage stats when no agentId", () => {
      const agent2 = db.createAgent({ name: "A2", systemPrompt: "P2" });
      db.logUsage({ agentId, sessionId: "s1", tokensIn: 100, tokensOut: 200, model: "m1", durationMs: 100 });
      db.logUsage({ agentId: agent2.id, sessionId: "s2", tokensIn: 50, tokensOut: 80, model: "m1", durationMs: 50 });
      const stats = db.getUsageStats();
      expect(stats.totalTokensIn).toBe(150);
      expect(stats.totalTokensOut).toBe(280);
      expect(stats.totalRequests).toBe(2);
    });

    it("should return zero stats when no usage", () => {
      const stats = db.getUsageStats(agentId);
      expect(stats.totalTokensIn).toBe(0);
      expect(stats.totalTokensOut).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });

    it("should get daily stats", () => {
      db.logUsage({ agentId, sessionId: "s1", tokensIn: 100, tokensOut: 200, model: "m1", durationMs: 100 });
      const daily = db.getDailyStats(agentId, 7);
      expect(daily.length).toBeGreaterThanOrEqual(1);
      expect(daily[0].tokensIn).toBe(100);
      expect(daily[0].tokensOut).toBe(200);
      expect(daily[0].requests).toBe(1);
    });

    it("should get daily stats without agentId filter", () => {
      db.logUsage({ agentId, sessionId: "s1", tokensIn: 100, tokensOut: 200, model: "m1", durationMs: 100 });
      const daily = db.getDailyStats(undefined, 7);
      expect(daily.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Cascade Deletes ---

  describe("Cascade Deletes", () => {
    it("should delete API keys when agent is deleted", () => {
      const agent = db.createAgent({ name: "Cascade", systemPrompt: "P" });
      db.createApiKey(agent.id, "k1");
      db.createApiKey(agent.id, "k2");
      expect(db.listApiKeys(agent.id)).toHaveLength(2);
      db.deleteAgent(agent.id);
      expect(db.listApiKeys(agent.id)).toHaveLength(0);
    });

    it("should delete sessions when agent is deleted", () => {
      const agent = db.createAgent({ name: "Cascade", systemPrompt: "P" });
      db.createSession(agent.id);
      db.createSession(agent.id);
      expect(db.listSessions(agent.id)).toHaveLength(2);
      db.deleteAgent(agent.id);
      expect(db.listSessions(agent.id)).toHaveLength(0);
    });

    it("should delete messages when session is deleted", () => {
      const agent = db.createAgent({ name: "Cascade", systemPrompt: "P" });
      const session = db.createSession(agent.id);
      db.addMessage({ sessionId: session.id, role: "user", content: "Hi" });
      db.addMessage({ sessionId: session.id, role: "assistant", content: "Hello" });
      expect(db.getMessages(session.id)).toHaveLength(2);
      db.deleteSession(session.id);
      expect(db.getMessages(session.id)).toHaveLength(0);
    });

    it("should cascade delete messages through agent → session", () => {
      const agent = db.createAgent({ name: "Cascade", systemPrompt: "P" });
      const session = db.createSession(agent.id);
      db.addMessage({ sessionId: session.id, role: "user", content: "Hi" });
      db.deleteAgent(agent.id);
      expect(db.getMessages(session.id)).toHaveLength(0);
    });
  });

  // --- createDatabase factory ---

  describe("createDatabase", () => {
    it("should create SQLiteAdapter via factory", async () => {
      const { createDatabase } = await import("../src/index.js");
      const adapter = createDatabase("sqlite", ":memory:");
      expect(adapter).toBeInstanceOf(SQLiteAdapter);
      adapter.close();
    });

    it("should throw for unsupported type", async () => {
      const { createDatabase } = await import("../src/index.js");
      expect(() => createDatabase("postgres", "")).toThrow("Unsupported database type: postgres");
    });
  });
});
