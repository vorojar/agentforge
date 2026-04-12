/**
 * MySQL 数据库适配器
 * 功能：基于 mysql2 连接池实现 DatabaseAdapter 接口
 * 创建时间：2026-03-31
 * 负责人：王觉贤
 */

import mysql from "mysql2/promise";
import type { Pool, RowDataPacket, ResultSetHeader, QueryResult } from "mysql2/promise";

type SqlParams = (string | number | Buffer | null | boolean)[];
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
import { MYSQL_MIGRATIONS, MYSQL_INDEXES } from "./migrations.js";

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface MySQLConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export class MySQLAdapter implements DatabaseAdapter {
  private pool: Pool;

  constructor(config: MySQLConfig) {
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      charset: "utf8mb4",
      timezone: "+08:00",
    });
  }

  async initialize(): Promise<void> {
    const statements = MYSQL_MIGRATIONS.split(";").map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await this.pool.execute(stmt);
    }
    for (const idx of MYSQL_INDEXES) {
      try { await this.pool.execute(idx); } catch { /* index may already exist */ }
    }
  }

  // --- Agents ---

  async createAgent(input: AgentCreateInput): Promise<AgentConfig> {
    const id = uuidv4();
    const now = this.nowStr();
    await this.pool.execute(
      `INSERT INTO agents (id, name, description, system_prompt, provider_id, model, temperature, max_tokens, max_iterations, streaming, thinking, tools, skills, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, input.name, input.description ?? "", input.systemPrompt, input.providerId ?? null,
       input.model ?? "claude-sonnet-4-20250514", input.temperature ?? 0.7, input.maxTokens ?? 4096,
       input.maxIterations ?? 15, input.streaming ? 1 : 0, input.thinking ? 1 : 0,
       JSON.stringify(input.tools ?? []), JSON.stringify(input.skills ?? []), now, now]
    );
    return (await this.getAgent(id))!;
  }

  async getAgent(id: string): Promise<AgentConfig | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM agents WHERE id = ?", [id]);
    if (rows.length === 0) return null;
    return this.mapAgent(rows[0]);
  }

  async listAgents(): Promise<AgentConfig[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM agents ORDER BY created_at DESC");
    return rows.map(r => this.mapAgent(r));
  }

  async updateAgent(id: string, input: AgentUpdateInput): Promise<AgentConfig | null> {
    const existing = await this.getAgent(id);
    if (!existing) return null;
    const fields: string[] = [];
    const values: SqlParams = [];
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
    values.push(this.nowStr());
    values.push(id);
    await this.pool.execute(`UPDATE agents SET ${fields.join(", ")} WHERE id = ?`, values);
    return (await this.getAgent(id))!;
  }

  async deleteAgent(id: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM agents WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }

  private mapAgent(row: RowDataPacket): AgentConfig {
    return {
      id: row.id, name: row.name, description: row.description ?? "",
      systemPrompt: row.system_prompt, providerId: row.provider_id ?? undefined,
      model: row.model, temperature: row.temperature, maxTokens: row.max_tokens,
      maxIterations: row.max_iterations, streaming: row.streaming === 1,
      thinking: row.thinking === 1,
      tools: typeof row.tools === "string" ? JSON.parse(row.tools) : (row.tools ?? []),
      skills: typeof row.skills === "string" ? JSON.parse(row.skills) : (row.skills ?? []),
      enabled: row.enabled === 1,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  // --- API Keys ---

  async createApiKey(agentId: string, name?: string): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const id = uuidv4();
    const raw = randomBytes(12).toString("hex");
    const rawKey = `af-${raw}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 8);
    const now = this.nowStr();
    await this.pool.execute(
      `INSERT INTO api_keys (id, agent_id, key_hash, key_prefix, name, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [id, agentId, keyHash, keyPrefix, name ?? "default", now]
    );
    return {
      apiKey: { id, agentId, keyHash, keyPrefix, name: name ?? "default", enabled: true, createdAt: now, lastUsedAt: null },
      rawKey,
    };
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM api_keys WHERE key_hash = ?", [keyHash]);
    if (rows.length === 0) return null;
    return this.mapApiKey(rows[0]);
  }

  async listApiKeys(agentId: string): Promise<ApiKey[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM api_keys WHERE agent_id = ? ORDER BY created_at DESC", [agentId]);
    return rows.map(r => this.mapApiKey(r));
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM api_keys WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }

  async touchApiKey(id: string): Promise<void> {
    await this.pool.execute("UPDATE api_keys SET last_used_at = ? WHERE id = ?", [this.nowStr(), id]);
  }

  private mapApiKey(row: RowDataPacket): ApiKey {
    return {
      id: row.id, agentId: row.agent_id, keyHash: row.key_hash, keyPrefix: row.key_prefix,
      name: row.name, enabled: row.enabled === 1, createdAt: String(row.created_at),
      lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    };
  }

  // --- Sessions ---

  async createSession(agentId: string): Promise<Session> {
    const id = uuidv4();
    const now = this.nowStr();
    await this.pool.execute("INSERT INTO sessions (id, agent_id, created_at, updated_at) VALUES (?, ?, ?, ?)", [id, agentId, now, now]);
    return { id, agentId, createdAt: now, updatedAt: now };
  }

  async getSession(id: string): Promise<Session | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM sessions WHERE id = ?", [id]);
    if (rows.length === 0) return null;
    return this.mapSession(rows[0]);
  }

  async listSessions(agentId?: string): Promise<Session[]> {
    const sessionSql = agentId
      ? "SELECT * FROM sessions WHERE agent_id = ? ORDER BY updated_at DESC LIMIT 200"
      : "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 200";
    const [sessionRows] = agentId
      ? await this.pool.execute<RowDataPacket[]>(sessionSql, [agentId])
      : await this.pool.execute<RowDataPacket[]>(sessionSql);
    if (sessionRows.length === 0) return [];

    const ids = sessionRows.map(r => r.id);
    const ph = ids.map(() => "?").join(",");

    const [statRows, msgRows] = await Promise.all([
      this.pool.execute<RowDataPacket[]>(
        `SELECT session_id, COUNT(*) as cnt, COALESCE(SUM(tokens_in),0) as ti,
                COALESCE(SUM(tokens_out),0) as to2, COALESCE(SUM(cache_read_tokens),0) as cr
         FROM messages WHERE session_id IN (${ph}) GROUP BY session_id`, ids
      ).then(r => r[0]),
      this.pool.execute<RowDataPacket[]>(
        `SELECT m.session_id, m.content FROM messages m
         INNER JOIN (
           SELECT session_id, MIN(created_at) as min_ca
           FROM messages WHERE session_id IN (${ph}) AND role = 'user' GROUP BY session_id
         ) sub ON m.session_id = sub.session_id AND m.created_at = sub.min_ca AND m.role = 'user'`, ids
      ).then(r => r[0]),
    ]);

    const statMap = new Map(statRows.map(r => [r.session_id, r]));
    const msgMap = new Map(msgRows.map(r => [r.session_id, r.content]));

    return sessionRows.map(r => {
      const st = statMap.get(r.id);
      return {
        id: r.id, agentId: r.agent_id,
        messageCount: st ? Number(st.cnt) : 0,
        totalTokensIn: st ? Number(st.ti) : 0,
        totalTokensOut: st ? Number(st.to2) : 0,
        totalCacheRead: st ? Number(st.cr) : 0,
        firstMessage: msgMap.get(r.id) ?? undefined,
        createdAt: String(r.created_at), updatedAt: String(r.updated_at),
      };
    });
  }

  async deleteSession(id: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM sessions WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }

  private mapSession(row: RowDataPacket): Session {
    return {
      id: row.id, agentId: row.agent_id,
      messageCount: row.message_count ?? undefined,
      totalTokensIn: row.total_tokens_in ?? undefined,
      totalTokensOut: row.total_tokens_out ?? undefined,
      totalCacheRead: row.total_cache_read ?? undefined,
      firstMessage: row.first_message ?? undefined,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  // --- Messages ---

  async addMessage(message: Omit<Message, "id" | "createdAt">): Promise<Message> {
    const id = uuidv4();
    const now = this.nowStr();
    const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
    await this.pool.execute(
      `INSERT INTO messages (id, session_id, role, content, thinking, model, tokens_in, tokens_out, cache_read_tokens, duration_ms, tool_calls, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, message.sessionId, message.role, content, message.thinking ?? null, message.model ?? null,
       message.tokensIn ?? 0, message.tokensOut ?? 0, message.cacheReadTokens ?? 0,
       message.durationMs ?? 0, message.toolCalls ?? null, now]
    );
    await this.pool.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", [now, message.sessionId]);
    return {
      id, sessionId: message.sessionId, role: message.role, content: message.content,
      thinking: message.thinking, model: message.model, tokensIn: message.tokensIn,
      tokensOut: message.tokensOut, durationMs: message.durationMs, toolCalls: message.toolCalls,
      createdAt: now,
    };
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, FIELD(role, 'assistant', 'tool', 'user') ASC", [sessionId]);
    return rows.map(r => this.mapMessage(r));
  }

  private mapMessage(row: RowDataPacket): Message {
    let content: string | ContentBlock[];
    const raw = row.content as string;
    try {
      const parsed = JSON.parse(raw);
      content = Array.isArray(parsed) ? parsed : raw;
    } catch { content = raw; }
    return {
      id: row.id, sessionId: row.session_id, role: row.role as Message["role"], content,
      thinking: row.thinking ?? undefined, model: row.model ?? undefined,
      tokensIn: row.tokens_in ?? undefined, tokensOut: row.tokens_out ?? undefined,
      cacheReadTokens: row.cache_read_tokens ?? undefined,
      durationMs: row.duration_ms ?? undefined, toolCalls: row.tool_calls ?? undefined,
      createdAt: String(row.created_at),
    };
  }

  // --- Usage ---

  async logUsage(log: Omit<UsageLog, "id" | "createdAt">): Promise<void> {
    const id = uuidv4();
    const now = this.nowStr();
    await this.pool.execute(
      `INSERT INTO usage_logs (id, agent_id, session_id, tokens_in, tokens_out, model, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, log.agentId, log.sessionId, log.tokensIn, log.tokensOut, log.model, log.durationMs, now]
    );
  }

  async getUsageStats(agentId?: string): Promise<UsageStats> {
    let sql = "SELECT COALESCE(SUM(tokens_in), 0) as total_in, COALESCE(SUM(tokens_out), 0) as total_out, COUNT(*) as total_requests FROM usage_logs";
    const params: SqlParams = [];
    if (agentId) { sql += " WHERE agent_id = ?"; params.push(agentId); }
    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params);
    const row = rows[0];
    return { totalTokensIn: Number(row.total_in), totalTokensOut: Number(row.total_out), totalRequests: Number(row.total_requests) };
  }

  async getDailyStats(agentId?: string, days: number = 30, startDate?: string, endDate?: string, granularity?: string): Promise<DailyStats[]> {
    const useHourly = granularity === "hour" || (startDate && endDate && startDate === endDate);
    const groupExpr = useHourly
      ? "DATE_FORMAT(created_at, '%Y-%m-%d %H:00')"
      : "DATE(created_at)";
    let sql = `SELECT ${groupExpr} as date, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out, COUNT(*) as requests
      FROM usage_logs WHERE 1=1`;
    const params: SqlParams = [];
    if (startDate && endDate) {
      sql += " AND DATE(created_at) >= ? AND DATE(created_at) <= ?";
      params.push(startDate, endDate);
    } else {
      sql += " AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)";
      params.push(days);
    }
    if (agentId) { sql += " AND agent_id = ?"; params.push(agentId); }
    sql += ` GROUP BY ${groupExpr} ORDER BY ${groupExpr} ASC`;
    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params);
    return rows.map(r => ({ date: String(r.date), tokensIn: Number(r.tokens_in), tokensOut: Number(r.tokens_out), requests: Number(r.requests) }));
  }

  async getSessionCounts(): Promise<{ total: number; today: number }> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN created_at >= CURDATE() THEN 1 ELSE 0 END) as today
       FROM sessions`
    );
    return { total: Number(rows[0].total), today: Number(rows[0].today) };
  }

  async getAgentUsageStats(startDate?: string, endDate?: string): Promise<Array<{ agentId: string; totalRequests: number; totalTokensIn: number; totalTokensOut: number }>> {
    let sql = `SELECT agent_id, COUNT(*) as requests, COALESCE(SUM(tokens_in), 0) as tokens_in, COALESCE(SUM(tokens_out), 0) as tokens_out FROM usage_logs WHERE 1=1`;
    const params: SqlParams = [];
    if (startDate && endDate) {
      sql += " AND DATE(created_at) >= ? AND DATE(created_at) <= ?";
      params.push(startDate, endDate);
    }
    sql += " GROUP BY agent_id ORDER BY requests DESC";
    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params);
    return rows.map(r => ({ agentId: r.agent_id, totalRequests: Number(r.requests), totalTokensIn: Number(r.tokens_in), totalTokensOut: Number(r.tokens_out) }));
  }

  async getModelStats(startDate?: string, endDate?: string): Promise<Array<{ model: string; requests: number; tokensIn: number; tokensOut: number }>> {
    let sql = `SELECT model, COUNT(*) as requests, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out FROM usage_logs WHERE 1=1`;
    const params: SqlParams = [];
    if (startDate && endDate) {
      sql += " AND DATE(created_at) >= ? AND DATE(created_at) <= ?";
      params.push(startDate, endDate);
    }
    sql += " GROUP BY model ORDER BY requests DESC";
    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params);
    return rows.map(r => ({ model: r.model, requests: Number(r.requests), tokensIn: Number(r.tokens_in), tokensOut: Number(r.tokens_out) }));
  }

  // --- HTTP Tools ---

  async createHttpTool(input: HttpToolCreateInput): Promise<HttpTool> {
    const id = uuidv4();
    const now = this.nowStr();
    await this.pool.execute(
      `INSERT INTO http_tools (id, name, description, method, url, headers, parameters, body_template, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, input.name, input.description ?? "", input.method ?? "GET", input.url,
       JSON.stringify(input.headers ?? {}), JSON.stringify(input.parameters ?? { type: "object", properties: {} }),
       input.bodyTemplate ?? "", now, now]
    );
    return (await this.getHttpTool(id))!;
  }

  async getHttpTool(id: string): Promise<HttpTool | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM http_tools WHERE id = ?", [id]);
    if (rows.length === 0) return null;
    return this.mapHttpTool(rows[0]);
  }

  async listHttpTools(): Promise<HttpTool[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM http_tools ORDER BY created_at DESC");
    return rows.map(r => this.mapHttpTool(r));
  }

  async updateHttpTool(id: string, input: HttpToolUpdateInput): Promise<HttpTool | null> {
    const existing = await this.getHttpTool(id);
    if (!existing) return null;
    const fields: string[] = [];
    const values: SqlParams = [];
    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (input.method !== undefined) { fields.push("method = ?"); values.push(input.method); }
    if (input.url !== undefined) { fields.push("url = ?"); values.push(input.url); }
    if (input.headers !== undefined) { fields.push("headers = ?"); values.push(JSON.stringify(input.headers)); }
    if (input.parameters !== undefined) { fields.push("parameters = ?"); values.push(JSON.stringify(input.parameters)); }
    if (input.bodyTemplate !== undefined) { fields.push("body_template = ?"); values.push(input.bodyTemplate); }
    if (input.enabled !== undefined) { fields.push("enabled = ?"); values.push(input.enabled ? 1 : 0); }
    if (fields.length === 0) return existing;
    fields.push("updated_at = ?"); values.push(this.nowStr()); values.push(id);
    await this.pool.execute(`UPDATE http_tools SET ${fields.join(", ")} WHERE id = ?`, values);
    return (await this.getHttpTool(id))!;
  }

  async deleteHttpTool(id: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM http_tools WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }

  private mapHttpTool(row: RowDataPacket): HttpTool {
    return {
      id: row.id, name: row.name, description: row.description ?? "",
      method: row.method, url: row.url,
      headers: typeof row.headers === "string" ? JSON.parse(row.headers) : (row.headers ?? {}),
      parameters: typeof row.parameters === "string" ? JSON.parse(row.parameters) : (row.parameters ?? {}),
      bodyTemplate: row.body_template ?? "", enabled: row.enabled === 1,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  // --- Providers ---

  async createProvider(input: ProviderCreateInput): Promise<ProviderConfig> {
    const id = uuidv4();
    const now = this.nowStr();
    if (input.isPrimary) {
      await this.pool.execute("UPDATE providers SET is_primary = 0");
    }
    await this.pool.execute(
      `INSERT INTO providers (id, name, type, api_key, base_url, default_model, enabled, is_primary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.name, input.type, input.apiKey, input.baseUrl ?? null, input.defaultModel,
       input.enabled !== false ? 1 : 0, input.isPrimary ? 1 : 0, now, now]
    );
    return (await this.getProvider(id))!;
  }

  async getProvider(id: string): Promise<ProviderConfig | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM providers WHERE id = ?", [id]);
    if (rows.length === 0) return null;
    return this.mapProvider(rows[0]);
  }

  async listProviders(): Promise<ProviderConfig[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM providers ORDER BY is_primary DESC, created_at ASC");
    return rows.map(r => this.mapProvider(r));
  }

  async updateProvider(id: string, input: ProviderUpdateInput): Promise<ProviderConfig | null> {
    const existing = await this.getProvider(id);
    if (!existing) return null;
    if (input.isPrimary) {
      await this.pool.execute("UPDATE providers SET is_primary = 0");
    }
    const fields: string[] = [];
    const values: SqlParams = [];
    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.type !== undefined) { fields.push("type = ?"); values.push(input.type); }
    if (input.apiKey !== undefined) { fields.push("api_key = ?"); values.push(input.apiKey); }
    if (input.baseUrl !== undefined) { fields.push("base_url = ?"); values.push(input.baseUrl || null); }
    if (input.defaultModel !== undefined) { fields.push("default_model = ?"); values.push(input.defaultModel); }
    if (input.enabled !== undefined) { fields.push("enabled = ?"); values.push(input.enabled ? 1 : 0); }
    if (input.isPrimary !== undefined) { fields.push("is_primary = ?"); values.push(input.isPrimary ? 1 : 0); }
    if (fields.length === 0) return existing;
    fields.push("updated_at = ?"); values.push(this.nowStr()); values.push(id);
    await this.pool.execute(`UPDATE providers SET ${fields.join(", ")} WHERE id = ?`, values);
    return (await this.getProvider(id))!;
  }

  async deleteProvider(id: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM providers WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }

  async getPrimaryProvider(): Promise<ProviderConfig | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM providers WHERE is_primary = 1 AND enabled = 1 LIMIT 1");
    if (rows.length > 0) return this.mapProvider(rows[0]);
    const [fallback] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM providers WHERE enabled = 1 LIMIT 1");
    return fallback.length > 0 ? this.mapProvider(fallback[0]) : null;
  }

  private mapProvider(row: RowDataPacket): ProviderConfig {
    return {
      id: row.id, name: row.name, type: row.type, apiKey: row.api_key,
      baseUrl: row.base_url ?? undefined, defaultModel: row.default_model,
      enabled: row.enabled === 1, isPrimary: row.is_primary === 1,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  // --- Knowledge Bases ---

  async createKnowledgeBase(input: KnowledgeBaseCreateInput): Promise<KnowledgeBase> {
    const id = uuidv4();
    const now = this.nowStr();
    await this.pool.execute(
      "INSERT INTO knowledge_bases (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [id, input.name, input.description ?? "", now, now]
    );
    return { id, name: input.name, description: input.description ?? "", createdAt: now, updatedAt: now };
  }

  async getKnowledgeBase(id: string): Promise<KnowledgeBase | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM knowledge_bases WHERE id = ?", [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, name: r.name, description: r.description ?? "", createdAt: String(r.created_at), updatedAt: String(r.updated_at) };
  }

  async listKnowledgeBases(): Promise<KnowledgeBase[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM knowledge_bases ORDER BY created_at DESC");
    return rows.map(r => ({ id: r.id, name: r.name, description: r.description ?? "", createdAt: String(r.created_at), updatedAt: String(r.updated_at) }));
  }

  async updateKnowledgeBase(id: string, input: KnowledgeBaseUpdateInput): Promise<KnowledgeBase | null> {
    const existing = await this.getKnowledgeBase(id);
    if (!existing) return null;
    const fields: string[] = [];
    const values: SqlParams = [];
    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (fields.length === 0) return existing;
    fields.push("updated_at = ?"); values.push(this.nowStr()); values.push(id);
    await this.pool.execute(`UPDATE knowledge_bases SET ${fields.join(", ")} WHERE id = ?`, values);
    return (await this.getKnowledgeBase(id))!;
  }

  async deleteKnowledgeBase(id: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM knowledge_bases WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }

  // --- Agent-Knowledge Association ---

  async setAgentKnowledge(agentId: string, kbIds: string[]): Promise<void> {
    await this.pool.execute("DELETE FROM agent_knowledge WHERE agent_id = ?", [agentId]);
    for (const kbId of kbIds) {
      await this.pool.execute("INSERT INTO agent_knowledge (agent_id, kb_id) VALUES (?, ?)", [agentId, kbId]);
    }
  }

  async getAgentKnowledge(agentId: string): Promise<string[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT kb_id FROM agent_knowledge WHERE agent_id = ?", [agentId]);
    return rows.map(r => r.kb_id);
  }

  // --- Knowledge Sources & Chunks ---

  async ingestKnowledge(kbId: string, sourceName: string, rawContent: string, chunks: string[], embeddings?: number[][]): Promise<number> {
    const [existing] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id FROM knowledge_sources WHERE kb_id = ? AND source_name = ?", [kbId, sourceName]
    );
    if (existing.length > 0) {
      await this.pool.execute("UPDATE knowledge_sources SET raw_content = ?, updated_at = NOW() WHERE id = ?", [rawContent, existing[0].id]);
    } else {
      await this.pool.execute(
        "INSERT INTO knowledge_sources (id, kb_id, source_name, raw_content) VALUES (?, ?, ?, ?)",
        [uuidv4(), kbId, sourceName, rawContent]
      );
    }
    await this.pool.execute("DELETE FROM knowledge_chunks WHERE kb_id = ? AND source_name = ?", [kbId, sourceName]);
    for (let i = 0; i < chunks.length; i++) {
      const emb = embeddings?.[i] ? Buffer.from(new Float32Array(embeddings[i]).buffer) : null;
      await this.pool.execute(
        "INSERT INTO knowledge_chunks (id, kb_id, source_name, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?, ?)",
        [uuidv4(), kbId, sourceName, i, chunks[i], emb]
      );
    }
    return chunks.length;
  }

  async searchKnowledge(kbIds: string[], query: string, limit: number = 5, queryEmbedding?: number[]): Promise<KnowledgeSearchResult[]> {
    if (kbIds.length === 0) return [];
    const placeholders = kbIds.map(() => "?").join(",");
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT kc.source_name, kc.content, kc.embedding, kb.name as kb_name
       FROM knowledge_chunks kc JOIN knowledge_bases kb ON kb.id = kc.kb_id
       WHERE kc.kb_id IN (${placeholders}) ORDER BY kc.chunk_index ASC`,
      kbIds
    );
    if (rows.length === 0) return [];

    const bm25Scores = this.bm25Score(query, rows.map(r => r.content));
    const hasEmbeddings = queryEmbedding && rows.some(r => r.embedding);
    const vectorScores: number[] = rows.map(r => {
      if (!hasEmbeddings || !r.embedding) return 0;
      const buf = r.embedding as Buffer;
      const chunkEmb = Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
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
    const k1 = 1.5; const b = 0.75;
    const df = new Map<string, number>();
    for (const term of queryTerms) {
      if (df.has(term)) continue;
      let count = 0;
      for (const doc of safeDocs) { if (doc.toLowerCase().includes(term)) count++; }
      df.set(term, count);
    }
    const N = safeDocs.length;
    return safeDocs.map(doc => {
      const lower = doc.toLowerCase(); const dl = doc.length;
      let score = 0;
      for (const term of queryTerms) {
        let tf = 0; let pos = 0;
        while ((pos = lower.indexOf(term, pos)) !== -1) { tf++; pos += term.length; }
        if (tf === 0) continue;
        const termDf = df.get(term) ?? 0;
        const idf = Math.log((N - termDf + 0.5) / (termDf + 0.5) + 1);
        const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgDl)));
        score += idf * tfNorm;
      }
      return score;
    }).map((s, _, arr) => { const max = Math.max(...arr); return max > 0 ? s / max : 0; });
  }

  private tokenize(text: string): string[] {
    const terms: string[] = [];
    const lower = (text ?? "").toLowerCase();
    for (const ch of lower) { if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) terms.push(ch); }
    const words = lower.match(/[a-z0-9]{2,}/g);
    if (words) terms.push(...words);
    const cjkParts = lower.match(/[\u4e00-\u9fff\u3400-\u4dbf]{2,}/g);
    if (cjkParts) terms.push(...cjkParts);
    return [...new Set(terms)];
  }

  async listKnowledgeSources(kbId: string): Promise<KnowledgeSource[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT source_name, COUNT(*) as cnt FROM knowledge_chunks WHERE kb_id = ? GROUP BY source_name", [kbId]
    );
    return rows.map(r => ({ sourceName: r.source_name, chunkCount: Number(r.cnt) }));
  }

  async getKnowledgeSourceContent(kbId: string, sourceName: string): Promise<string | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT raw_content FROM knowledge_sources WHERE kb_id = ? AND source_name = ?", [kbId, sourceName]
    );
    return rows.length > 0 ? rows[0].raw_content : null;
  }

  async renameKnowledgeSource(kbId: string, oldName: string, newName: string): Promise<boolean> {
    await this.pool.execute(
      "UPDATE knowledge_sources SET source_name = ?, updated_at = NOW() WHERE kb_id = ? AND source_name = ?",
      [newName, kbId, oldName]
    );
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE knowledge_chunks SET source_name = ? WHERE kb_id = ? AND source_name = ?",
      [newName, kbId, oldName]
    );
    return result.affectedRows > 0;
  }

  async deleteKnowledgeSource(kbId: string, sourceName: string): Promise<boolean> {
    await this.pool.execute("DELETE FROM knowledge_sources WHERE kb_id = ? AND source_name = ?", [kbId, sourceName]);
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM knowledge_chunks WHERE kb_id = ? AND source_name = ?", [kbId, sourceName]);
    return result.affectedRows > 0;
  }

  // --- Provider Channels ---

  async createChannel(providerId: string, name: string): Promise<{ channel: ProviderChannel; rawKey: string }> {
    const id = uuidv4();
    const raw = randomBytes(16).toString("hex");
    const rawKey = `af-ch-${raw}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 10);
    const now = this.nowStr();
    await this.pool.execute(
      `INSERT INTO provider_channels (id, provider_id, name, key_hash, key_prefix, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, providerId, name, keyHash, keyPrefix, now, now]
    );
    return {
      channel: { id, providerId, name, keyHash, keyPrefix, enabled: true, createdAt: now, updatedAt: now },
      rawKey,
    };
  }

  async getChannelByHash(keyHash: string): Promise<(ProviderChannel & { providerConfig: ProviderConfig }) | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT pc.*, p.id as p_id, p.name as p_name, p.type as p_type, p.api_key as p_api_key,
              p.base_url as p_base_url, p.default_model as p_default_model, p.enabled as p_enabled,
              p.is_primary as p_is_primary, p.created_at as p_created_at, p.updated_at as p_updated_at
       FROM provider_channels pc JOIN providers p ON p.id = pc.provider_id
       WHERE pc.key_hash = ? AND pc.enabled = 1`, [keyHash]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id, providerId: r.provider_id, name: r.name, keyHash: r.key_hash,
      keyPrefix: r.key_prefix, enabled: r.enabled === 1,
      createdAt: String(r.created_at), updatedAt: String(r.updated_at),
      providerConfig: {
        id: r.p_id, name: r.p_name, type: r.p_type, apiKey: r.p_api_key,
        baseUrl: r.p_base_url ?? undefined, defaultModel: r.p_default_model,
        enabled: r.p_enabled === 1, isPrimary: r.p_is_primary === 1,
        createdAt: String(r.p_created_at), updatedAt: String(r.p_updated_at),
      },
    };
  }

  async listChannels(providerId: string): Promise<ProviderChannel[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT * FROM provider_channels WHERE provider_id = ? ORDER BY created_at DESC", [providerId]
    );
    return rows.map(r => ({
      id: r.id, providerId: r.provider_id, name: r.name, keyHash: r.key_hash,
      keyPrefix: r.key_prefix, enabled: r.enabled === 1,
      createdAt: String(r.created_at), updatedAt: String(r.updated_at),
    }));
  }

  async deleteChannel(id: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM provider_channels WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }

  // --- Proxy Usage ---

  async logProxyUsage(log: ProxyUsageLog): Promise<void> {
    const id = uuidv4();
    const now = this.nowStr();
    await this.pool.execute(
      `INSERT INTO proxy_usage_logs (id, channel_id, provider_id, model, tokens_in, tokens_out, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, log.channelId, log.providerId, log.model, log.tokensIn, log.tokensOut, log.durationMs, now]
    );
  }

  async getChannelStats(channelId: string, days: number = 30): Promise<ChannelStats> {
    const [totalRows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) as requests, COALESCE(SUM(tokens_in), 0) as tokens_in, COALESCE(SUM(tokens_out), 0) as tokens_out FROM proxy_usage_logs WHERE channel_id = ?",
      [channelId]
    );
    const [dailyRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT DATE(created_at) as date, COUNT(*) as requests, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out
       FROM proxy_usage_logs WHERE channel_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(created_at) ORDER BY DATE(created_at) ASC`,
      [channelId, days]
    );
    const t = totalRows[0];
    return {
      totalRequests: Number(t.requests), totalTokensIn: Number(t.tokens_in), totalTokensOut: Number(t.tokens_out),
      daily: dailyRows.map(r => ({ date: String(r.date), requests: Number(r.requests), tokensIn: Number(r.tokens_in), tokensOut: Number(r.tokens_out) })),
    };
  }

  async getProviderChannelStats(providerId: string, startDate?: string, endDate?: string): Promise<Array<{ channelId: string; channelName: string; totalRequests: number; totalTokensIn: number; totalTokensOut: number }>> {
    let joinCondition = "pu.channel_id = pc.id";
    const params: SqlParams = [];
    if (startDate && endDate) {
      joinCondition += " AND DATE(pu.created_at) >= ? AND DATE(pu.created_at) <= ?";
      params.push(startDate, endDate);
    }
    params.push(providerId);
    const sql = `SELECT pc.id as channel_id, pc.name as channel_name, COUNT(pu.id) as requests,
              COALESCE(SUM(pu.tokens_in), 0) as tokens_in, COALESCE(SUM(pu.tokens_out), 0) as tokens_out
       FROM provider_channels pc LEFT JOIN proxy_usage_logs pu ON ${joinCondition}
       WHERE pc.provider_id = ? GROUP BY pc.id, pc.name ORDER BY requests DESC`;
    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params);
    return rows.map(r => ({
      channelId: r.channel_id, channelName: r.channel_name,
      totalRequests: Number(r.requests), totalTokensIn: Number(r.tokens_in), totalTokensOut: Number(r.tokens_out),
    }));
  }

  async getProxyDailyStats(days: number = 30, startDate?: string, endDate?: string, granularity?: string): Promise<DailyStats[]> {
    const useHourly = granularity === "hour" || (startDate && endDate && startDate === endDate);
    const groupExpr = useHourly
      ? "DATE_FORMAT(created_at, '%Y-%m-%d %H:00')"
      : "DATE(created_at)";
    let sql = `SELECT ${groupExpr} as date, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out, COUNT(*) as requests
       FROM proxy_usage_logs WHERE 1=1`;
    const params: SqlParams = [];
    if (startDate && endDate) {
      sql += " AND DATE(created_at) >= ? AND DATE(created_at) <= ?";
      params.push(startDate, endDate);
    } else {
      sql += " AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)";
      params.push(days);
    }
    sql += ` GROUP BY ${groupExpr} ORDER BY ${groupExpr} ASC`;
    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params);
    return rows.map(r => ({ date: String(r.date), tokensIn: Number(r.tokens_in), tokensOut: Number(r.tokens_out), requests: Number(r.requests) }));
  }

  async getProxyOverview(): Promise<{ totalRequests: number; totalTokensIn: number; totalTokensOut: number; totalChannels: number }> {
    const [[usageRows], [channelRows]] = await Promise.all([
      this.pool.execute<RowDataPacket[]>("SELECT COUNT(*) as cnt, COALESCE(SUM(tokens_in),0) as ti, COALESCE(SUM(tokens_out),0) as to2 FROM proxy_usage_logs"),
      this.pool.execute<RowDataPacket[]>("SELECT COUNT(*) as cnt FROM provider_channels"),
    ]);
    return {
      totalRequests: Number(usageRows[0].cnt),
      totalTokensIn: Number(usageRows[0].ti),
      totalTokensOut: Number(usageRows[0].to2),
      totalChannels: Number(channelRows[0].cnt),
    };
  }

  // --- Lifecycle ---

  async close(): Promise<void> {
    await this.pool.end();
  }

  private nowStr(): string {
    const d = new Date();
    const offset = 8 * 60;
    const local = new Date(d.getTime() + offset * 60000);
    return local.toISOString().slice(0, 19).replace("T", " ");
  }
}
