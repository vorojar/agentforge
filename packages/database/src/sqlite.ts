import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { createHash, randomBytes } from "node:crypto";
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
} from "@agentforge/types";
import { MIGRATIONS } from "./migrations.js";

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export class SQLiteAdapter implements DatabaseAdapter {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.runMigrations();
  }

  private runMigrations(): void {
    this.db.exec(MIGRATIONS);
  }

  // --- Agents ---

  createAgent(input: AgentCreateInput): AgentConfig {
    const id = uuidv4();
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO agents (id, name, description, system_prompt, model, temperature, max_tokens, max_iterations, streaming, tools, skills, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    stmt.run(
      id,
      input.name,
      input.description ?? "",
      input.systemPrompt,
      input.model ?? "claude-sonnet-4-20250514",
      input.temperature ?? 0.7,
      input.maxTokens ?? 4096,
      input.maxIterations ?? 15,
      input.streaming ? 1 : 0,
      JSON.stringify(input.tools ?? []),
      JSON.stringify(input.skills ?? []),
      now,
      now,
    );
    return this.getAgent(id)!;
  }

  getAgent(id: string): AgentConfig | null {
    const row = this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapAgent(row);
  }

  listAgents(): AgentConfig[] {
    const rows = this.db.prepare("SELECT * FROM agents ORDER BY created_at DESC").all() as Record<string, unknown>[];
    return rows.map((r) => this.mapAgent(r));
  }

  updateAgent(id: string, input: AgentUpdateInput): AgentConfig | null {
    const existing = this.getAgent(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (input.systemPrompt !== undefined) { fields.push("system_prompt = ?"); values.push(input.systemPrompt); }
    if (input.model !== undefined) { fields.push("model = ?"); values.push(input.model); }
    if (input.temperature !== undefined) { fields.push("temperature = ?"); values.push(input.temperature); }
    if (input.maxTokens !== undefined) { fields.push("max_tokens = ?"); values.push(input.maxTokens); }
    if (input.maxIterations !== undefined) { fields.push("max_iterations = ?"); values.push(input.maxIterations); }
    if (input.streaming !== undefined) { fields.push("streaming = ?"); values.push(input.streaming ? 1 : 0); }
    if (input.tools !== undefined) { fields.push("tools = ?"); values.push(JSON.stringify(input.tools)); }
    if (input.skills !== undefined) { fields.push("skills = ?"); values.push(JSON.stringify(input.skills)); }
    if (input.enabled !== undefined) { fields.push("enabled = ?"); values.push(input.enabled ? 1 : 0); }

    if (fields.length === 0) return existing;

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE agents SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.getAgent(id)!;
  }

  deleteAgent(id: string): boolean {
    const result = this.db.prepare("DELETE FROM agents WHERE id = ?").run(id);
    return result.changes > 0;
  }

  private mapAgent(row: Record<string, unknown>): AgentConfig {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      systemPrompt: row.system_prompt as string,
      model: row.model as string,
      temperature: row.temperature as number,
      maxTokens: row.max_tokens as number,
      maxIterations: row.max_iterations as number,
      streaming: (row.streaming as number) === 1,
      tools: JSON.parse(row.tools as string),
      skills: JSON.parse(row.skills as string),
      enabled: (row.enabled as number) === 1,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  // --- API Keys ---

  createApiKey(agentId: string, name?: string): { apiKey: ApiKey; rawKey: string } {
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
      apiKey: {
        id,
        agentId,
        keyHash,
        keyPrefix,
        name: name ?? "default",
        enabled: true,
        createdAt: now,
        lastUsedAt: null,
      },
      rawKey,
    };
  }

  getApiKeyByHash(keyHash: string): ApiKey | null {
    const row = this.db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").get(keyHash) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapApiKey(row);
  }

  listApiKeys(agentId: string): ApiKey[] {
    const rows = this.db.prepare("SELECT * FROM api_keys WHERE agent_id = ? ORDER BY created_at DESC").all(agentId) as Record<string, unknown>[];
    return rows.map((r) => this.mapApiKey(r));
  }

  deleteApiKey(id: string): boolean {
    const result = this.db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
    return result.changes > 0;
  }

  touchApiKey(id: string): void {
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

  createSession(agentId: string): Session {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO sessions (id, agent_id, created_at, updated_at) VALUES (?, ?, ?, ?)
    `).run(id, agentId, now, now);
    return { id, agentId, createdAt: now, updatedAt: now };
  }

  getSession(id: string): Session | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapSession(row);
  }

  listSessions(agentId?: string): Session[] {
    if (agentId) {
      const rows = this.db.prepare("SELECT * FROM sessions WHERE agent_id = ? ORDER BY updated_at DESC").all(agentId) as Record<string, unknown>[];
      return rows.map((r) => this.mapSession(r));
    }
    const rows = this.db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all() as Record<string, unknown>[];
    return rows.map((r) => this.mapSession(r));
  }

  deleteSession(id: string): boolean {
    const result = this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return result.changes > 0;
  }

  private mapSession(row: Record<string, unknown>): Session {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  // --- Messages ---

  addMessage(message: Omit<Message, "id" | "createdAt">): Message {
    const id = uuidv4();
    const now = new Date().toISOString();
    const content = typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);

    this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, model, tokens_in, tokens_out, duration_ms, tool_calls, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      message.sessionId,
      message.role,
      content,
      message.model ?? null,
      message.tokensIn ?? 0,
      message.tokensOut ?? 0,
      message.durationMs ?? 0,
      message.toolCalls ?? null,
      now,
    );

    // Update session updated_at
    this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(now, message.sessionId);

    return {
      id,
      sessionId: message.sessionId,
      role: message.role,
      content: message.content,
      model: message.model,
      tokensIn: message.tokensIn,
      tokensOut: message.tokensOut,
      durationMs: message.durationMs,
      toolCalls: message.toolCalls,
      createdAt: now,
    };
  }

  getMessages(sessionId: string): Message[] {
    const rows = this.db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC").all(sessionId) as Record<string, unknown>[];
    return rows.map((r) => this.mapMessage(r));
  }

  private mapMessage(row: Record<string, unknown>): Message {
    let content: string | import("@agentforge/types").ContentBlock[];
    const raw = row.content as string;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        content = parsed;
      } else {
        content = raw;
      }
    } catch {
      content = raw;
    }

    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      role: row.role as Message["role"],
      content,
      model: (row.model as string) ?? undefined,
      tokensIn: (row.tokens_in as number) ?? undefined,
      tokensOut: (row.tokens_out as number) ?? undefined,
      durationMs: (row.duration_ms as number) ?? undefined,
      toolCalls: (row.tool_calls as string) ?? undefined,
      createdAt: row.created_at as string,
    };
  }

  // --- Usage ---

  logUsage(log: Omit<UsageLog, "id" | "createdAt">): void {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO usage_logs (id, agent_id, session_id, tokens_in, tokens_out, model, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, log.agentId, log.sessionId, log.tokensIn, log.tokensOut, log.model, log.durationMs, now);
  }

  getUsageStats(agentId?: string): UsageStats {
    let sql = "SELECT COALESCE(SUM(tokens_in), 0) as total_in, COALESCE(SUM(tokens_out), 0) as total_out, COUNT(*) as total_requests FROM usage_logs";
    const params: unknown[] = [];
    if (agentId) {
      sql += " WHERE agent_id = ?";
      params.push(agentId);
    }
    const row = this.db.prepare(sql).get(...params) as Record<string, unknown>;
    return {
      totalTokensIn: row.total_in as number,
      totalTokensOut: row.total_out as number,
      totalRequests: row.total_requests as number,
    };
  }

  getDailyStats(agentId?: string, days: number = 30): DailyStats[] {
    let sql = `
      SELECT date(created_at) as date,
             SUM(tokens_in) as tokens_in,
             SUM(tokens_out) as tokens_out,
             COUNT(*) as requests
      FROM usage_logs
      WHERE created_at >= datetime('now', ?)
    `;
    const params: unknown[] = [`-${days} days`];
    if (agentId) {
      sql += " AND agent_id = ?";
      params.push(agentId);
    }
    sql += " GROUP BY date(created_at) ORDER BY date(created_at) ASC";
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((r) => ({
      date: r.date as string,
      tokensIn: r.tokens_in as number,
      tokensOut: r.tokens_out as number,
      requests: r.requests as number,
    }));
  }

  // --- HTTP Tools ---

  createHttpTool(input: HttpToolCreateInput): HttpTool {
    const id = uuidv4();
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO http_tools (id, name, description, method, url, headers, parameters, body_template, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    stmt.run(
      id,
      input.name,
      input.description ?? "",
      input.method ?? "GET",
      input.url,
      JSON.stringify(input.headers ?? {}),
      JSON.stringify(input.parameters ?? { type: "object", properties: {} }),
      input.bodyTemplate ?? "",
      now,
      now,
    );
    return this.getHttpTool(id)!;
  }

  getHttpTool(id: string): HttpTool | null {
    const row = this.db.prepare("SELECT * FROM http_tools WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapHttpTool(row);
  }

  listHttpTools(): HttpTool[] {
    const rows = this.db.prepare("SELECT * FROM http_tools ORDER BY created_at DESC").all() as Record<string, unknown>[];
    return rows.map((r) => this.mapHttpTool(r));
  }

  updateHttpTool(id: string, input: HttpToolUpdateInput): HttpTool | null {
    const existing = this.getHttpTool(id);
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
    return this.getHttpTool(id)!;
  }

  deleteHttpTool(id: string): boolean {
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

  // --- Lifecycle ---

  close(): void {
    this.db.close();
  }
}
