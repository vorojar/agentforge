import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  DatabaseAdapter,
  AgentConfig,
  AgentCreateInput,
  AgentUpdateInput,
  ApiKey,
  UsageLog,
  UsageStats,
  DailyStats,
  Session,
  Message,
  HttpTool,
  HttpToolCreateInput,
  HttpToolUpdateInput,
  ProviderConfig,
  ProviderCreateInput,
  ProviderUpdateInput,
  KnowledgeBase,
  KnowledgeBaseCreateInput,
  KnowledgeBaseUpdateInput,
  KnowledgeSource,
  KnowledgeSearchResult,
  ProviderChannel,
  ProxyUsageLog,
  ChannelStats,
  ContentBlock,
} from "@agentforge/types";
import { SQLITE_MIGRATIONS, SQLITE_INDEXES, SQLITE_INCREMENTAL_MIGRATIONS } from "./migrations.js";

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export class SQLiteAdapter implements DatabaseAdapter {
  private db: Database.Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  async initialize(): Promise<void> {
    this.db.exec(SQLITE_MIGRATIONS);
    for (const idx of SQLITE_INDEXES) {
      try { this.db.exec(idx); } catch { /* index may already exist */ }
    }
    for (const migration of SQLITE_INCREMENTAL_MIGRATIONS) {
      for (const sql of migration.up) {
        try { this.db.exec(sql); } catch { /* column/table may already exist */ }
      }
    }
  }

  // --- Agents ---

  async createAgent(input: AgentCreateInput): Promise<AgentConfig> {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO agents (id, name, description, system_prompt, provider_id, model, temperature, max_tokens, max_iterations, streaming, thinking, tools, skills, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id, input.name, input.description ?? "", input.systemPrompt,
      input.providerId ?? null, input.model ?? "claude-sonnet-4-20250514",
      input.temperature ?? 0.7, input.maxTokens ?? 4096, input.maxIterations ?? 15,
      input.streaming ? 1 : 0, input.thinking ? 1 : 0,
      JSON.stringify(input.tools ?? []), JSON.stringify(input.skills ?? []),
      now, now,
    );
    return (await this.getAgent(id))!;
  }

  async getAgent(id: string): Promise<AgentConfig | null> {
    const row = this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapAgent(row);
  }

  async listAgents(): Promise<AgentConfig[]> {
    const rows = this.db.prepare("SELECT * FROM agents ORDER BY created_at DESC").all() as Record<string, unknown>[];
    return rows.map((r) => this.mapAgent(r));
  }

  async updateAgent(id: string, input: AgentUpdateInput): Promise<AgentConfig | null> {
    const existing = await this.getAgent(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (input.systemPrompt !== undefined) { fields.push("system_prompt = ?"); values.push(input.systemPrompt); }
    if (input.providerId !== undefined) { fields.push("provider_id = ?"); values.push(input.providerId || null); }
    if (input.model !== undefined) { fields.push("model = ?"); values.push(input.model); }
    if (input.temperature !== undefined) { fields.push("temperature = ?"); values.push(input.temperature); }
    if (input.maxTokens !== undefined) { fields.push("max_tokens = ?"); values.push(input.maxTokens); }
    if (input.maxIterations !== undefined) { fields.push("max_iterations = ?"); values.push(input.maxIterations); }
    if (input.streaming !== undefined) { fields.push("streaming = ?"); values.push(input.streaming ? 1 : 0); }
    if (input.thinking !== undefined) { fields.push("thinking = ?"); values.push(input.thinking ? 1 : 0); }
    if (input.tools !== undefined) { fields.push("tools = ?"); values.push(JSON.stringify(input.tools)); }
    if (input.skills !== undefined) { fields.push("skills = ?"); values.push(JSON.stringify(input.skills)); }
    if (input.enabled !== undefined) { fields.push("enabled = ?"); values.push(input.enabled ? 1 : 0); }

    if (fields.length === 0) return existing;

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE agents SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return (await this.getAgent(id))!;
  }

  async deleteAgent(id: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM agents WHERE id = ?").run(id);
    return result.changes > 0;
  }

  private mapAgent(row: Record<string, unknown>): AgentConfig {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      systemPrompt: row.system_prompt as string,
      providerId: (row.provider_id as string) ?? undefined,
      model: row.model as string,
      temperature: row.temperature as number,
      maxTokens: row.max_tokens as number,
      maxIterations: row.max_iterations as number,
      streaming: (row.streaming as number) === 1,
      thinking: (row.thinking as number) === 1,
      tools: JSON.parse(row.tools as string),
      skills: JSON.parse(row.skills as string),
      enabled: (row.enabled as number) === 1,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  // --- API Keys ---

  async createApiKey(agentId: string, name?: string): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const id = uuidv4();
    const raw = randomBytes(12).toString("hex");
    const rawKey = `af-${raw}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 8);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO api_keys (id, agent_id, key_hash, key_prefix, name, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(id, agentId, keyHash, keyPrefix, name ?? "default", now);

    return {
      apiKey: { id, agentId, keyHash, keyPrefix, name: name ?? "default", enabled: true, createdAt: now, lastUsedAt: null },
      rawKey,
    };
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const row = this.db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").get(keyHash) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapApiKey(row);
  }

  async listApiKeys(agentId: string): Promise<ApiKey[]> {
    const rows = this.db.prepare("SELECT * FROM api_keys WHERE agent_id = ? ORDER BY created_at DESC").all(agentId) as Record<string, unknown>[];
    return rows.map((r) => this.mapApiKey(r));
  }

  async listAllApiKeys(): Promise<ApiKey[]> {
    const rows = this.db.prepare("SELECT * FROM api_keys ORDER BY created_at DESC").all() as Record<string, unknown>[];
    return rows.map((r) => this.mapApiKey(r));
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
    return result.changes > 0;
  }

  async touchApiKey(id: string): Promise<void> {
    this.db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  }

  private mapApiKey(row: Record<string, unknown>): ApiKey {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      keyHash: row.key_hash as string,
      keyPrefix: row.key_prefix as string,
      name: row.name as string,
      enabled: (row.enabled as number) === 1,
      createdAt: row.created_at as string,
      lastUsedAt: (row.last_used_at as string) ?? null,
    };
  }

  // --- Sessions ---

  async createSession(agentId: string): Promise<Session> {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare("INSERT INTO sessions (id, agent_id, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, agentId, now, now);
    return { id, agentId, createdAt: now, updatedAt: now };
  }

  async getSession(id: string): Promise<Session | null> {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapSession(row);
  }

  async listSessions(agentId?: string, limit: number = 50, offset: number = 0): Promise<Session[]> {
    const sql = `SELECT s.*, COUNT(m.id) as message_count,
      COALESCE(SUM(m.tokens_in), 0) as total_tokens_in,
      COALESCE(SUM(m.tokens_out), 0) as total_tokens_out,
      COALESCE(SUM(m.cache_read_tokens), 0) as total_cache_read,
      (SELECT content FROM messages WHERE session_id = s.id AND role = 'user' ORDER BY created_at ASC LIMIT 1) as first_message
      FROM sessions s LEFT JOIN messages m ON m.session_id = s.id
      ${agentId ? "WHERE s.agent_id = ?" : ""}
      GROUP BY s.id ORDER BY s.updated_at DESC
      LIMIT ? OFFSET ?`;
    const params = agentId ? [agentId, limit, offset] : [limit, offset];
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.mapSession(r));
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return result.changes > 0;
  }

  private mapSession(row: Record<string, unknown>): Session {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      messageCount: (row.message_count as number) ?? undefined,
      totalTokensIn: (row.total_tokens_in as number) ?? undefined,
      totalTokensOut: (row.total_tokens_out as number) ?? undefined,
      totalCacheRead: (row.total_cache_read as number) ?? undefined,
      firstMessage: (row.first_message as string) ?? undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  // --- Messages ---

  async addMessage(message: Omit<Message, "id" | "createdAt">): Promise<Message> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const content = typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);

    this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, thinking, model, tokens_in, tokens_out, cache_read_tokens, duration_ms, tool_calls, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, message.sessionId, message.role, content,
      message.thinking ?? null, message.model ?? null,
      message.tokensIn ?? 0, message.tokensOut ?? 0,
      message.cacheReadTokens ?? 0, message.durationMs ?? 0,
      message.toolCalls ?? null, now,
    );

    this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(now, message.sessionId);

    return {
      id, sessionId: message.sessionId, role: message.role, content: message.content,
      thinking: message.thinking, model: message.model, tokensIn: message.tokensIn,
      tokensOut: message.tokensOut, cacheReadTokens: message.cacheReadTokens,
      durationMs: message.durationMs, toolCalls: message.toolCalls, createdAt: now,
    };
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    const rows = this.db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC").all(sessionId) as Record<string, unknown>[];
    return rows.map((r) => this.mapMessage(r));
  }

  private mapMessage(row: Record<string, unknown>): Message {
    let content: string | ContentBlock[];
    const raw = row.content as string;
    try {
      const parsed = JSON.parse(raw);
      content = Array.isArray(parsed) ? parsed : raw;
    } catch { content = raw; }

    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      role: row.role as Message["role"],
      content,
      thinking: (row.thinking as string) ?? undefined,
      model: (row.model as string) ?? undefined,
      tokensIn: (row.tokens_in as number) ?? undefined,
      tokensOut: (row.tokens_out as number) ?? undefined,
      cacheReadTokens: (row.cache_read_tokens as number) ?? undefined,
      durationMs: (row.duration_ms as number) ?? undefined,
      toolCalls: (row.tool_calls as string) ?? undefined,
      createdAt: row.created_at as string,
    };
  }

  // --- Usage ---

  async logUsage(log: Omit<UsageLog, "id" | "createdAt">): Promise<void> {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO usage_logs (id, agent_id, session_id, tokens_in, tokens_out, model, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, log.agentId, log.sessionId, log.tokensIn, log.tokensOut, log.model, log.durationMs, now);
  }

  async getUsageStats(agentId?: string): Promise<UsageStats> {
    let sql = "SELECT COALESCE(SUM(tokens_in), 0) as total_in, COALESCE(SUM(tokens_out), 0) as total_out, COUNT(*) as total_requests FROM usage_logs";
    const params: unknown[] = [];
    if (agentId) { sql += " WHERE agent_id = ?"; params.push(agentId); }
    const row = this.db.prepare(sql).get(...params) as Record<string, unknown>;
    return {
      totalTokensIn: row.total_in as number,
      totalTokensOut: row.total_out as number,
      totalRequests: row.total_requests as number,
    };
  }

  async getDailyStats(agentId?: string, days: number = 30, startDate?: string, endDate?: string, granularity?: string): Promise<DailyStats[]> {
    const useHourly = granularity === "hour" || (startDate && endDate && startDate === endDate);
    const groupExpr = useHourly
      ? "strftime('%Y-%m-%d %H:00', created_at)"
      : "date(created_at)";
    let sql = `SELECT ${groupExpr} as date, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out, COUNT(*) as requests
      FROM usage_logs WHERE 1=1`;
    const params: unknown[] = [];
    if (startDate && endDate) {
      sql += " AND date(created_at) >= ? AND date(created_at) <= ?";
      params.push(startDate, endDate);
    } else {
      sql += " AND created_at >= datetime('now', ?)";
      params.push(`-${days} days`);
    }
    if (agentId) { sql += " AND agent_id = ?"; params.push(agentId); }
    sql += ` GROUP BY ${groupExpr} ORDER BY ${groupExpr} ASC`;
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((r) => ({
      date: r.date as string,
      tokensIn: r.tokens_in as number,
      tokensOut: r.tokens_out as number,
      requests: r.requests as number,
    }));
  }

  async getSessionCounts(): Promise<{ total: number; today: number }> {
    const total = (this.db.prepare("SELECT COUNT(*) as c FROM sessions").get() as { c: number }).c;
    const today = (this.db.prepare("SELECT COUNT(*) as c FROM sessions WHERE date(created_at) = date('now')").get() as { c: number }).c;
    return { total, today };
  }

  async getAgentUsageStats(startDate?: string, endDate?: string): Promise<Array<{ agentId: string; totalRequests: number; totalTokensIn: number; totalTokensOut: number }>> {
    let sql = "SELECT agent_id, COUNT(*) as requests, COALESCE(SUM(tokens_in), 0) as tokens_in, COALESCE(SUM(tokens_out), 0) as tokens_out FROM usage_logs WHERE 1=1";
    const params: unknown[] = [];
    if (startDate && endDate) {
      sql += " AND date(created_at) >= ? AND date(created_at) <= ?";
      params.push(startDate, endDate);
    }
    sql += " GROUP BY agent_id ORDER BY requests DESC";
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(r => ({
      agentId: r.agent_id as string,
      totalRequests: r.requests as number,
      totalTokensIn: r.tokens_in as number,
      totalTokensOut: r.tokens_out as number,
    }));
  }

  async getModelStats(startDate?: string, endDate?: string): Promise<Array<{ model: string; requests: number; tokensIn: number; tokensOut: number }>> {
    let sql = "SELECT model, COUNT(*) as requests, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out FROM usage_logs WHERE 1=1";
    const params: unknown[] = [];
    if (startDate && endDate) {
      sql += " AND date(created_at) >= ? AND date(created_at) <= ?";
      params.push(startDate, endDate);
    }
    sql += " GROUP BY model ORDER BY requests DESC";
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(r => ({
      model: r.model as string,
      requests: r.requests as number,
      tokensIn: r.tokens_in as number,
      tokensOut: r.tokens_out as number,
    }));
  }

  // --- HTTP Tools ---

  async createHttpTool(input: HttpToolCreateInput): Promise<HttpTool> {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO http_tools (id, name, description, method, url, headers, parameters, body_template, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id, input.name, input.description ?? "", input.method ?? "GET", input.url,
      JSON.stringify(input.headers ?? {}), JSON.stringify(input.parameters ?? { type: "object", properties: {} }),
      input.bodyTemplate ?? "", now, now,
    );
    return (await this.getHttpTool(id))!;
  }

  async getHttpTool(id: string): Promise<HttpTool | null> {
    const row = this.db.prepare("SELECT * FROM http_tools WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapHttpTool(row);
  }

  async listHttpTools(): Promise<HttpTool[]> {
    const rows = this.db.prepare("SELECT * FROM http_tools ORDER BY created_at DESC").all() as Record<string, unknown>[];
    return rows.map((r) => this.mapHttpTool(r));
  }

  async updateHttpTool(id: string, input: HttpToolUpdateInput): Promise<HttpTool | null> {
    const existing = await this.getHttpTool(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (input.method !== undefined) { fields.push("method = ?"); values.push(input.method); }
    if (input.url !== undefined) { fields.push("url = ?"); values.push(input.url); }
    if (input.headers !== undefined) { fields.push("headers = ?"); values.push(JSON.stringify(input.headers)); }
    if (input.parameters !== undefined) { fields.push("parameters = ?"); values.push(JSON.stringify(input.parameters)); }
    if (input.bodyTemplate !== undefined) { fields.push("body_template = ?"); values.push(input.bodyTemplate); }
    if (input.enabled !== undefined) { fields.push("enabled = ?"); values.push(input.enabled ? 1 : 0); }

    if (fields.length === 0) return existing;

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE http_tools SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return (await this.getHttpTool(id))!;
  }

  async deleteHttpTool(id: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM http_tools WHERE id = ?").run(id);
    return result.changes > 0;
  }

  private mapHttpTool(row: Record<string, unknown>): HttpTool {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      method: row.method as string,
      url: row.url as string,
      headers: JSON.parse(row.headers as string),
      parameters: JSON.parse(row.parameters as string),
      bodyTemplate: row.body_template as string,
      enabled: (row.enabled as number) === 1,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  // --- Providers ---

  async createProvider(input: ProviderCreateInput): Promise<ProviderConfig> {
    const id = uuidv4();
    const now = new Date().toISOString();
    if (input.isPrimary) {
      this.db.prepare("UPDATE providers SET is_primary = 0").run();
    }
    this.db.prepare(`
      INSERT INTO providers (id, name, type, api_key, base_url, default_model, enabled, is_primary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.name, input.type, input.apiKey, input.baseUrl ?? null, input.defaultModel,
      input.enabled !== false ? 1 : 0, input.isPrimary ? 1 : 0, now, now);
    return (await this.getProvider(id))!;
  }

  async getProvider(id: string): Promise<ProviderConfig | null> {
    const row = this.db.prepare("SELECT * FROM providers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapProvider(row);
  }

  async listProviders(): Promise<ProviderConfig[]> {
    const rows = this.db.prepare("SELECT * FROM providers ORDER BY is_primary DESC, created_at ASC").all() as Record<string, unknown>[];
    return rows.map((r) => this.mapProvider(r));
  }

  async updateProvider(id: string, input: ProviderUpdateInput): Promise<ProviderConfig | null> {
    const existing = await this.getProvider(id);
    if (!existing) return null;

    if (input.isPrimary) {
      this.db.prepare("UPDATE providers SET is_primary = 0").run();
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.type !== undefined) { fields.push("type = ?"); values.push(input.type); }
    if (input.apiKey !== undefined) { fields.push("api_key = ?"); values.push(input.apiKey); }
    if (input.baseUrl !== undefined) { fields.push("base_url = ?"); values.push(input.baseUrl || null); }
    if (input.defaultModel !== undefined) { fields.push("default_model = ?"); values.push(input.defaultModel); }
    if (input.enabled !== undefined) { fields.push("enabled = ?"); values.push(input.enabled ? 1 : 0); }
    if (input.isPrimary !== undefined) { fields.push("is_primary = ?"); values.push(input.isPrimary ? 1 : 0); }

    if (fields.length === 0) return existing;
    fields.push("updated_at = ?"); values.push(new Date().toISOString()); values.push(id);
    this.db.prepare(`UPDATE providers SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return (await this.getProvider(id))!;
  }

  async deleteProvider(id: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM providers WHERE id = ?").run(id);
    return result.changes > 0;
  }

  async getPrimaryProvider(): Promise<ProviderConfig | null> {
    const row = this.db.prepare("SELECT * FROM providers WHERE is_primary = 1 AND enabled = 1 LIMIT 1").get() as Record<string, unknown> | undefined;
    if (!row) {
      const fallback = this.db.prepare("SELECT * FROM providers WHERE enabled = 1 LIMIT 1").get() as Record<string, unknown> | undefined;
      return fallback ? this.mapProvider(fallback) : null;
    }
    return this.mapProvider(row);
  }

  private mapProvider(row: Record<string, unknown>): ProviderConfig {
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as string,
      apiKey: row.api_key as string,
      baseUrl: (row.base_url as string) ?? undefined,
      defaultModel: row.default_model as string,
      enabled: (row.enabled as number) === 1,
      isPrimary: (row.is_primary as number) === 1,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  // --- Knowledge Bases ---

  async createKnowledgeBase(input: KnowledgeBaseCreateInput): Promise<KnowledgeBase> {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare("INSERT INTO knowledge_bases (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
      id, input.name, input.description ?? "", now, now
    );
    return { id, name: input.name, description: input.description ?? "", createdAt: now, updatedAt: now };
  }

  async getKnowledgeBase(id: string): Promise<KnowledgeBase | null> {
    const row = this.db.prepare("SELECT * FROM knowledge_bases WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { id: row.id as string, name: row.name as string, description: (row.description as string) ?? "", createdAt: row.created_at as string, updatedAt: row.updated_at as string };
  }

  async listKnowledgeBases(): Promise<KnowledgeBase[]> {
    const rows = this.db.prepare("SELECT * FROM knowledge_bases ORDER BY created_at DESC").all() as Record<string, unknown>[];
    return rows.map(r => ({ id: r.id as string, name: r.name as string, description: (r.description as string) ?? "", createdAt: r.created_at as string, updatedAt: r.updated_at as string }));
  }

  async updateKnowledgeBase(id: string, input: KnowledgeBaseUpdateInput): Promise<KnowledgeBase | null> {
    const existing = await this.getKnowledgeBase(id);
    if (!existing) return null;
    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (fields.length === 0) return existing;
    fields.push("updated_at = ?"); values.push(new Date().toISOString()); values.push(id);
    this.db.prepare(`UPDATE knowledge_bases SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return (await this.getKnowledgeBase(id))!;
  }

  async deleteKnowledgeBase(id: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM knowledge_bases WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // --- Agent-Knowledge Association ---

  async setAgentKnowledge(agentId: string, kbIds: string[]): Promise<void> {
    this.db.prepare("DELETE FROM agent_knowledge WHERE agent_id = ?").run(agentId);
    const stmt = this.db.prepare("INSERT INTO agent_knowledge (agent_id, kb_id) VALUES (?, ?)");
    for (const kbId of kbIds) {
      stmt.run(agentId, kbId);
    }
  }

  async getAgentKnowledge(agentId: string): Promise<string[]> {
    const rows = this.db.prepare("SELECT kb_id FROM agent_knowledge WHERE agent_id = ?").all(agentId) as Array<{ kb_id: string }>;
    return rows.map(r => r.kb_id);
  }

  // --- Knowledge Sources & Chunks ---

  async ingestKnowledge(kbId: string, sourceName: string, rawContent: string, chunks: string[], embeddings?: number[][]): Promise<number> {
    const existing = this.db.prepare("SELECT id FROM knowledge_sources WHERE kb_id = ? AND source_name = ?").get(kbId, sourceName) as { id: string } | undefined;
    if (existing) {
      this.db.prepare("UPDATE knowledge_sources SET raw_content = ?, updated_at = ? WHERE id = ?").run(rawContent, new Date().toISOString(), existing.id);
    } else {
      this.db.prepare("INSERT INTO knowledge_sources (id, kb_id, source_name, raw_content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        uuidv4(), kbId, sourceName, rawContent, new Date().toISOString(), new Date().toISOString()
      );
    }
    this.db.prepare("DELETE FROM knowledge_chunks WHERE kb_id = ? AND source_name = ?").run(kbId, sourceName);
    const stmt = this.db.prepare("INSERT INTO knowledge_chunks (id, kb_id, source_name, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?, ?)");
    for (let i = 0; i < chunks.length; i++) {
      const emb = embeddings?.[i] ? Buffer.from(new Float32Array(embeddings[i]).buffer) : null;
      stmt.run(uuidv4(), kbId, sourceName, i, chunks[i], emb);
    }
    return chunks.length;
  }

  async searchKnowledge(kbIds: string[], query: string, limit: number = 5, queryEmbedding?: number[]): Promise<KnowledgeSearchResult[]> {
    if (kbIds.length === 0) return [];
    const placeholders = kbIds.map(() => "?").join(",");
    const selectCols = queryEmbedding
      ? "kc.source_name, kc.content, kc.embedding, kb.name as kb_name"
      : "kc.source_name, kc.content, kb.name as kb_name";
    const rows = this.db.prepare(
      `SELECT ${selectCols} FROM knowledge_chunks kc JOIN knowledge_bases kb ON kb.id = kc.kb_id
       WHERE kc.kb_id IN (${placeholders}) ORDER BY kc.chunk_index ASC`
    ).all(...kbIds) as Array<{ source_name: string; content: string; embedding?: Buffer | null; kb_name: string }>;

    if (rows.length === 0) return [];

    const bm25Scores = this.bm25Score(query, rows.map(r => r.content));
    const hasEmbeddings = queryEmbedding && rows.some(r => r.embedding);
    const vectorScores: number[] = rows.map(r => {
      if (!hasEmbeddings || !r.embedding) return 0;
      const chunkEmb = Array.from(new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4));
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < queryEmbedding!.length && i < chunkEmb.length; i++) {
        dot += queryEmbedding![i] * chunkEmb[i];
        normA += queryEmbedding![i] * queryEmbedding![i];
        normB += chunkEmb[i] * chunkEmb[i];
      }
      const denom = Math.sqrt(normA) * Math.sqrt(normB);
      return denom === 0 ? 0 : dot / denom;
    });

    const vectorWeight = hasEmbeddings ? 0.6 : 0;
    const bm25Weight = hasEmbeddings ? 0.4 : 1.0;

    return rows.map((r, i) => {
      const score = vectorScores[i] * vectorWeight + bm25Scores[i] * bm25Weight;
      return { sourceName: r.source_name, content: r.content, score, kbName: r.kb_name };
    }).filter(r => r.score > 0.05).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private bm25Score(query: string, docs: string[]): number[] {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return docs.map(() => 0);
    const safeDocs = docs.map(d => d ?? "");
    const avgDl = safeDocs.reduce((s, d) => s + d.length, 0) / safeDocs.length || 1;
    const k1 = 1.5;
    const b = 0.75;
    const df = new Map<string, number>();
    for (const term of queryTerms) {
      if (df.has(term)) continue;
      let count = 0;
      for (const doc of safeDocs) { if (doc.toLowerCase().includes(term)) count++; }
      df.set(term, count);
    }
    const N = safeDocs.length;

    return safeDocs.map(doc => {
      const lower = doc.toLowerCase();
      const dl = doc.length;
      let score = 0;
      for (const term of queryTerms) {
        let tf = 0;
        let pos = 0;
        while ((pos = lower.indexOf(term, pos)) !== -1) { tf++; pos += term.length; }
        if (tf === 0) continue;
        const termDf = df.get(term) ?? 0;
        const idf = Math.log((N - termDf + 0.5) / (termDf + 0.5) + 1);
        const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgDl)));
        score += idf * tfNorm;
      }
      return score;
    }).map((s, _, arr) => {
      const max = Math.max(...arr);
      return max > 0 ? s / max : 0;
    });
  }

  private tokenize(text: string): string[] {
    const terms: string[] = [];
    const lower = (text ?? "").toLowerCase();
    for (const ch of lower) {
      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) terms.push(ch);
    }
    const words = lower.match(/[a-z0-9]{2,}/g);
    if (words) terms.push(...words);
    const cjkParts = lower.match(/[\u4e00-\u9fff\u3400-\u4dbf]{2,}/g);
    if (cjkParts) terms.push(...cjkParts);
    return [...new Set(terms)];
  }

  async listKnowledgeSources(kbId: string): Promise<KnowledgeSource[]> {
    const rows = this.db.prepare(
      "SELECT source_name, COUNT(*) as cnt FROM knowledge_chunks WHERE kb_id = ? GROUP BY source_name"
    ).all(kbId) as Array<{ source_name: string; cnt: number }>;
    return rows.map(r => ({ sourceName: r.source_name, chunkCount: r.cnt }));
  }

  async getKnowledgeSourceContent(kbId: string, sourceName: string): Promise<string | null> {
    const row = this.db.prepare("SELECT raw_content FROM knowledge_sources WHERE kb_id = ? AND source_name = ?").get(kbId, sourceName) as { raw_content: string } | undefined;
    return row ? row.raw_content : null;
  }

  async renameKnowledgeSource(kbId: string, oldName: string, newName: string): Promise<boolean> {
    this.db.prepare("UPDATE knowledge_sources SET source_name = ?, updated_at = ? WHERE kb_id = ? AND source_name = ?").run(newName, new Date().toISOString(), kbId, oldName);
    const result = this.db.prepare("UPDATE knowledge_chunks SET source_name = ? WHERE kb_id = ? AND source_name = ?").run(newName, kbId, oldName);
    return result.changes > 0;
  }

  async deleteKnowledgeSource(kbId: string, sourceName: string): Promise<boolean> {
    this.db.prepare("DELETE FROM knowledge_sources WHERE kb_id = ? AND source_name = ?").run(kbId, sourceName);
    const result = this.db.prepare("DELETE FROM knowledge_chunks WHERE kb_id = ? AND source_name = ?").run(kbId, sourceName);
    return result.changes > 0;
  }

  // --- Provider Channels ---

  async createChannel(providerId: string, name: string): Promise<{ channel: ProviderChannel; rawKey: string }> {
    const id = uuidv4();
    const raw = randomBytes(16).toString("hex");
    const rawKey = `af-ch-${raw}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 10);
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO provider_channels (id, provider_id, name, key_hash, key_prefix, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, providerId, name, keyHash, keyPrefix, now, now);
    return {
      channel: { id, providerId, name, keyHash, keyPrefix, enabled: true, createdAt: now, updatedAt: now },
      rawKey,
    };
  }

  async getChannelByHash(keyHash: string): Promise<(ProviderChannel & { providerConfig: ProviderConfig }) | null> {
    const row = this.db.prepare(`
      SELECT pc.*, p.id as p_id, p.name as p_name, p.type as p_type, p.api_key as p_api_key,
             p.base_url as p_base_url, p.default_model as p_default_model, p.enabled as p_enabled,
             p.is_primary as p_is_primary, p.created_at as p_created_at, p.updated_at as p_updated_at
      FROM provider_channels pc JOIN providers p ON p.id = pc.provider_id
      WHERE pc.key_hash = ? AND pc.enabled = 1
    `).get(keyHash) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string, providerId: row.provider_id as string, name: row.name as string,
      keyHash: row.key_hash as string, keyPrefix: row.key_prefix as string,
      enabled: (row.enabled as number) === 1,
      createdAt: row.created_at as string, updatedAt: row.updated_at as string,
      providerConfig: {
        id: row.p_id as string, name: row.p_name as string, type: row.p_type as string,
        apiKey: row.p_api_key as string, baseUrl: (row.p_base_url as string) ?? undefined,
        defaultModel: row.p_default_model as string, enabled: (row.p_enabled as number) === 1,
        isPrimary: (row.p_is_primary as number) === 1,
        createdAt: row.p_created_at as string, updatedAt: row.p_updated_at as string,
      },
    };
  }

  async listChannels(providerId: string): Promise<ProviderChannel[]> {
    const rows = this.db.prepare("SELECT * FROM provider_channels WHERE provider_id = ? ORDER BY created_at DESC").all(providerId) as Record<string, unknown>[];
    return rows.map(r => ({
      id: r.id as string, providerId: r.provider_id as string, name: r.name as string,
      keyHash: r.key_hash as string, keyPrefix: r.key_prefix as string,
      enabled: (r.enabled as number) === 1,
      createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    }));
  }

  async deleteChannel(id: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM provider_channels WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // --- Proxy Usage ---

  async logProxyUsage(log: ProxyUsageLog): Promise<void> {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO proxy_usage_logs (id, channel_id, provider_id, model, tokens_in, tokens_out, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, log.channelId, log.providerId, log.model, log.tokensIn, log.tokensOut, log.durationMs, now);
  }

  async getChannelStats(channelId: string, days: number = 30): Promise<ChannelStats> {
    const totalRow = this.db.prepare(
      "SELECT COUNT(*) as requests, COALESCE(SUM(tokens_in), 0) as tokens_in, COALESCE(SUM(tokens_out), 0) as tokens_out FROM proxy_usage_logs WHERE channel_id = ?"
    ).get(channelId) as Record<string, unknown>;
    const dailyRows = this.db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as requests, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out
      FROM proxy_usage_logs WHERE channel_id = ? AND created_at >= datetime('now', ?)
      GROUP BY date(created_at) ORDER BY date(created_at) ASC
    `).all(channelId, `-${days} days`) as Record<string, unknown>[];
    return {
      totalRequests: totalRow.requests as number,
      totalTokensIn: totalRow.tokens_in as number,
      totalTokensOut: totalRow.tokens_out as number,
      daily: dailyRows.map(r => ({
        date: r.date as string, requests: r.requests as number,
        tokensIn: r.tokens_in as number, tokensOut: r.tokens_out as number,
      })),
    };
  }

  async getProviderChannelStats(providerId: string, startDate?: string, endDate?: string): Promise<Array<{ channelId: string; channelName: string; totalRequests: number; totalTokensIn: number; totalTokensOut: number }>> {
    let dateFilter = "";
    const params: unknown[] = [];
    if (startDate && endDate) {
      dateFilter = " AND date(pu.created_at) >= ? AND date(pu.created_at) <= ?";
      params.push(startDate, endDate);
    }
    params.push(providerId);
    const rows = this.db.prepare(`
      SELECT pc.id as channel_id, pc.name as channel_name, COUNT(pu.id) as requests,
             COALESCE(SUM(pu.tokens_in), 0) as tokens_in, COALESCE(SUM(pu.tokens_out), 0) as tokens_out
      FROM provider_channels pc LEFT JOIN proxy_usage_logs pu ON pu.channel_id = pc.id${dateFilter}
      WHERE pc.provider_id = ? GROUP BY pc.id, pc.name ORDER BY requests DESC
    `).all(...params) as Record<string, unknown>[];
    return rows.map(r => ({
      channelId: r.channel_id as string, channelName: r.channel_name as string,
      totalRequests: r.requests as number, totalTokensIn: r.tokens_in as number, totalTokensOut: r.tokens_out as number,
    }));
  }

  async getProxyDailyStats(days: number = 30, startDate?: string, endDate?: string, granularity?: string): Promise<DailyStats[]> {
    const useHourly = granularity === "hour" || (startDate && endDate && startDate === endDate);
    const groupExpr = useHourly
      ? "strftime('%Y-%m-%d %H:00', created_at)"
      : "date(created_at)";
    let sql = `SELECT ${groupExpr} as date, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out, COUNT(*) as requests
      FROM proxy_usage_logs WHERE 1=1`;
    const params: unknown[] = [];
    if (startDate && endDate) {
      sql += " AND date(created_at) >= ? AND date(created_at) <= ?";
      params.push(startDate, endDate);
    } else {
      sql += " AND created_at >= datetime('now', ?)";
      params.push(`-${days} days`);
    }
    sql += ` GROUP BY ${groupExpr} ORDER BY ${groupExpr} ASC`;
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(r => ({
      date: r.date as string, tokensIn: r.tokens_in as number,
      tokensOut: r.tokens_out as number, requests: r.requests as number,
    }));
  }

  async getProxyOverview(): Promise<{ totalRequests: number; totalTokensIn: number; totalTokensOut: number; totalChannels: number }> {
    const usageRow = this.db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(tokens_in),0) as ti, COALESCE(SUM(tokens_out),0) as to2 FROM proxy_usage_logs").get() as Record<string, unknown>;
    const channelRow = this.db.prepare("SELECT COUNT(*) as cnt FROM provider_channels").get() as Record<string, unknown>;
    return {
      totalRequests: usageRow.cnt as number,
      totalTokensIn: usageRow.ti as number,
      totalTokensOut: usageRow.to2 as number,
      totalChannels: channelRow.cnt as number,
    };
  }

  // --- Lifecycle ---

  async close(): Promise<void> {
    this.db.close();
  }
}
