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
  ModelTrace,
  ModelCapabilities,
  AuditLog,
  AuditLogInput,
  IdentityProviderConfig,
  IdentityProviderCreateInput,
  Membership,
  MembershipInput,
  Organization,
  OrganizationCreateInput,
  TenantBootstrapResult,
  UserAccount,
  UserCreateInput,
  Workspace,
  WorkspaceCreateInput,
} from "@agentforge/types";
import { MYSQL_MIGRATIONS, MYSQL_INDEXES, MYSQL_ALTERS } from "./migrations.js";

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function parseJsonArray<T>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value: unknown): T | undefined {
  if (!value) return undefined;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : undefined;
  } catch {
    return undefined;
  }
}

function normalizeCategory(category?: string): string {
  return category?.trim() ?? "";
}

function normalizeSlug(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "default";
}

function defaultModelCapabilities(type?: string): ModelCapabilities {
  return {
    supportsTools: true,
    supportsVision: true,
    supportsThinking: type === "claude",
    supportsStreaming: true,
  };
}

function normalizeModelCapabilities(type: string | undefined, input?: Partial<ModelCapabilities>): ModelCapabilities {
  return { ...defaultModelCapabilities(type), ...(input ?? {}) };
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
    for (const alter of MYSQL_ALTERS) {
      try { await this.pool.execute(alter); } catch { /* column/table may already exist */ }
    }
    for (const idx of MYSQL_INDEXES) {
      try { await this.pool.execute(idx); } catch { /* index may already exist */ }
    }
    await this.backfillDefaultWorkspace();
  }

  private async getDefaultWorkspaceId(): Promise<string> {
    return (await this.ensureDefaultTenant()).workspace.id;
  }

  private async resolveWorkspaceId(workspaceId?: string | null): Promise<string> {
    return workspaceId || await this.getDefaultWorkspaceId();
  }

  private async backfillDefaultWorkspace(): Promise<void> {
    const workspaceId = await this.getDefaultWorkspaceId();
    const tables = ["providers", "agents", "sessions", "usage_logs", "http_tools", "knowledge_bases", "provider_channels", "proxy_usage_logs"];
    for (const table of tables) {
      try {
        await this.pool.execute(`UPDATE ${table} SET workspace_id = ? WHERE workspace_id IS NULL OR workspace_id = ''`, [workspaceId]);
      } catch {
        // Table or column may not exist in partial schemas during upgrades.
      }
    }
    try {
      await this.pool.execute(
        `INSERT IGNORE INTO workspace_skill_categories (workspace_id, skill_name, category, updated_at)
         SELECT ?, skill_name, category, updated_at FROM skill_categories`,
        [workspaceId],
      );
    } catch {
      // Legacy table may not exist in partial databases.
    }
  }

  // --- Tenant foundation ---

  async ensureDefaultTenant(): Promise<TenantBootstrapResult> {
    const [orgRows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM organizations WHERE slug = ?", ["default"]);
    const organization = orgRows.length > 0
      ? this.mapOrganization(orgRows[0])
      : await this.createOrganization({ name: "Default Organization", slug: "default" });

    const [workspaceRows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT * FROM workspaces WHERE organization_id = ? AND slug = ?",
      [organization.id, "default"],
    );
    const workspace = workspaceRows.length > 0
      ? this.mapWorkspace(workspaceRows[0])
      : await this.createWorkspace({ organizationId: organization.id, name: "Default Workspace", slug: "default" });

    return { organization, workspace };
  }

  async createOrganization(input: OrganizationCreateInput): Promise<Organization> {
    const id = uuidv4();
    const now = this.nowStr();
    const slug = normalizeSlug(input.slug ?? input.name);
    await this.pool.execute(
      "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [id, input.name.trim(), slug, now, now],
    );
    return (await this.getOrganization(id))!;
  }

  async getOrganization(id: string): Promise<Organization | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM organizations WHERE id = ?", [id]);
    return rows.length > 0 ? this.mapOrganization(rows[0]) : null;
  }

  async listOrganizations(): Promise<Organization[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM organizations ORDER BY created_at ASC");
    return rows.map((row) => this.mapOrganization(row));
  }

  async createWorkspace(input: WorkspaceCreateInput): Promise<Workspace> {
    const id = uuidv4();
    const now = this.nowStr();
    const slug = normalizeSlug(input.slug ?? input.name);
    await this.pool.execute(
      "INSERT INTO workspaces (id, organization_id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, input.organizationId, input.name.trim(), slug, now, now],
    );
    return (await this.getWorkspace(id))!;
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM workspaces WHERE id = ?", [id]);
    return rows.length > 0 ? this.mapWorkspace(rows[0]) : null;
  }

  async listWorkspaces(organizationId?: string): Promise<Workspace[]> {
    const [rows] = organizationId
      ? await this.pool.execute<RowDataPacket[]>("SELECT * FROM workspaces WHERE organization_id = ? ORDER BY created_at ASC", [organizationId])
      : await this.pool.execute<RowDataPacket[]>("SELECT * FROM workspaces ORDER BY created_at ASC");
    return rows.map((row) => this.mapWorkspace(row));
  }

  async createUser(input: UserCreateInput): Promise<UserAccount> {
    const id = uuidv4();
    const now = this.nowStr();
    const email = input.email.trim().toLowerCase();
    await this.pool.execute(
      "INSERT INTO users (id, email, display_name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, email, input.displayName.trim(), input.avatarUrl ?? null, now, now],
    );
    return (await this.getUser(id))!;
  }

  async getUser(id: string): Promise<UserAccount | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM users WHERE id = ?", [id]);
    return rows.length > 0 ? this.mapUser(rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<UserAccount | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()]);
    return rows.length > 0 ? this.mapUser(rows[0]) : null;
  }

  async listUsers(): Promise<UserAccount[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM users ORDER BY created_at ASC");
    return rows.map((row) => this.mapUser(row));
  }

  async upsertMembership(input: MembershipInput): Promise<Membership> {
    const workspaceId = input.workspaceId ?? null;
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT * FROM memberships
       WHERE organization_id = ? AND user_id = ? AND ((workspace_id IS NULL AND ? IS NULL) OR workspace_id = ?)`,
      [input.organizationId, input.userId, workspaceId, workspaceId],
    );
    const now = this.nowStr();
    if (rows.length > 0) {
      await this.pool.execute(
        "UPDATE memberships SET role = ?, status = ?, updated_at = ? WHERE id = ?",
        [input.role, input.status ?? "active", now, rows[0].id],
      );
      return (await this.getMembership(rows[0].id))!;
    }

    const id = uuidv4();
    await this.pool.execute(
      `INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.organizationId, workspaceId, input.userId, input.role, input.status ?? "active", now, now],
    );
    return (await this.getMembership(id))!;
  }

  async listMemberships(organizationId: string, workspaceId?: string | null): Promise<Membership[]> {
    const [rows] = workspaceId === undefined
      ? await this.pool.execute<RowDataPacket[]>("SELECT * FROM memberships WHERE organization_id = ? ORDER BY created_at ASC", [organizationId])
      : await this.pool.execute<RowDataPacket[]>(
          `SELECT * FROM memberships
           WHERE organization_id = ? AND ((workspace_id IS NULL AND ? IS NULL) OR workspace_id = ?)
           ORDER BY created_at ASC`,
          [organizationId, workspaceId, workspaceId],
        );
    return rows.map((row) => this.mapMembership(row));
  }

  async createIdentityProvider(input: IdentityProviderCreateInput): Promise<IdentityProviderConfig> {
    const id = uuidv4();
    const now = this.nowStr();
    await this.pool.execute(
      `INSERT INTO identity_providers
        (id, organization_id, type, provider, name, issuer_url, client_id, client_secret_ref, sso_url, certificate, claim_mapping, group_mapping, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.organizationId, input.type, input.provider.trim(), input.name.trim(),
        input.issuerUrl ?? null, input.clientId ?? null, input.clientSecretRef ?? null,
        input.ssoUrl ?? null, input.certificate ?? null,
        JSON.stringify(input.claimMapping ?? {}), JSON.stringify(input.groupMapping ?? {}),
        input.enabled !== false ? 1 : 0, now, now,
      ],
    );
    const providers = await this.listIdentityProviders(input.organizationId);
    return providers.find((provider) => provider.id === id)!;
  }

  async listIdentityProviders(organizationId: string): Promise<IdentityProviderConfig[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT * FROM identity_providers WHERE organization_id = ? ORDER BY created_at ASC",
      [organizationId],
    );
    return rows.map((row) => this.mapIdentityProvider(row));
  }

  async createAuditLog(input: AuditLogInput): Promise<AuditLog> {
    const id = uuidv4();
    const now = this.nowStr();
    await this.pool.execute(
      `INSERT INTO audit_logs
        (id, organization_id, workspace_id, actor_user_id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.organizationId, input.workspaceId ?? null, input.actorUserId ?? null,
        input.action, input.resourceType, input.resourceId ?? null,
        JSON.stringify(input.metadata ?? {}), input.ipAddress ?? null, input.userAgent ?? null, now,
      ],
    );
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM audit_logs WHERE id = ?", [id]);
    return this.mapAuditLog(rows[0]);
  }

  async listAuditLogs(organizationId: string, options?: { workspaceId?: string; limit?: number }): Promise<AuditLog[]> {
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
    const [rows] = options?.workspaceId
      ? await this.pool.execute<RowDataPacket[]>(
          `SELECT * FROM audit_logs
           WHERE organization_id = ? AND workspace_id = ?
           ORDER BY created_at DESC LIMIT ?`,
          [organizationId, options.workspaceId, limit],
        )
      : await this.pool.execute<RowDataPacket[]>(
          "SELECT * FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT ?",
          [organizationId, limit],
        );
    return rows.map((row) => this.mapAuditLog(row));
  }

  private async getMembership(id: string): Promise<Membership | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM memberships WHERE id = ?", [id]);
    return rows.length > 0 ? this.mapMembership(rows[0]) : null;
  }

  private mapOrganization(row: RowDataPacket): Organization {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapWorkspace(row: RowDataPacket): Workspace {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      slug: row.slug,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapUser(row: RowDataPacket): UserAccount {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url ?? undefined,
      lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapMembership(row: RowDataPacket): Membership {
    return {
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id ?? null,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapIdentityProvider(row: RowDataPacket): IdentityProviderConfig {
    return {
      id: row.id,
      organizationId: row.organization_id,
      type: row.type,
      provider: row.provider,
      name: row.name,
      issuerUrl: row.issuer_url ?? undefined,
      clientId: row.client_id ?? undefined,
      clientSecretRef: row.client_secret_ref ?? undefined,
      ssoUrl: row.sso_url ?? undefined,
      certificate: row.certificate ?? undefined,
      claimMapping: parseJsonObject<Record<string, string>>(row.claim_mapping) ?? {},
      groupMapping: parseJsonObject<Record<string, string>>(row.group_mapping) ?? {},
      enabled: row.enabled === 1,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapAuditLog(row: RowDataPacket): AuditLog {
    return {
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id ?? null,
      actorUserId: row.actor_user_id ?? null,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id ?? null,
      metadata: parseJsonObject<Record<string, unknown>>(row.metadata) ?? {},
      ipAddress: row.ip_address ?? undefined,
      userAgent: row.user_agent ?? undefined,
      createdAt: String(row.created_at),
    };
  }

  // --- Agents ---

  async createAgent(input: AgentCreateInput): Promise<AgentConfig> {
    const id = uuidv4();
    const now = this.nowStr();
    const workspaceId = await this.resolveWorkspaceId(input.workspaceId);
    await this.pool.execute(
      `INSERT INTO agents (id, workspace_id, name, description, system_prompt, provider_id, model, fallback_models, fallback_cooldown_seconds, temperature, max_tokens, max_iterations, streaming, thinking, tools, skills, category, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, workspaceId, input.name, input.description ?? "", input.systemPrompt, input.providerId ?? null,
       input.model ?? "claude-sonnet-4-20250514", JSON.stringify(input.fallbackModels ?? []), input.fallbackCooldownSeconds ?? 900,
       input.temperature ?? 0.7, input.maxTokens ?? 4096,
       input.maxIterations ?? 15, input.streaming ? 1 : 0, input.thinking ? 1 : 0,
       JSON.stringify(input.tools ?? []), JSON.stringify(input.skills ?? []), normalizeCategory(input.category), now, now]
    );
    return (await this.getAgent(id))!;
  }

  async getAgent(id: string): Promise<AgentConfig | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM agents WHERE id = ?", [id]);
    if (rows.length === 0) return null;
    return this.mapAgent(rows[0]);
  }

  async listAgents(workspaceId?: string): Promise<AgentConfig[]> {
    const [rows] = workspaceId
      ? await this.pool.execute<RowDataPacket[]>("SELECT * FROM agents WHERE workspace_id = ? ORDER BY created_at DESC", [workspaceId])
      : await this.pool.execute<RowDataPacket[]>("SELECT * FROM agents ORDER BY created_at DESC");
    return rows.map(r => this.mapAgent(r));
  }

  async updateAgent(id: string, input: AgentUpdateInput): Promise<AgentConfig | null> {
    const existing = await this.getAgent(id);
    if (!existing) return null;
    const fields: string[] = [];
    const values: SqlParams = [];
    if (input.workspaceId !== undefined) { fields.push("workspace_id = ?"); values.push(input.workspaceId); }
    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (input.systemPrompt !== undefined) { fields.push("system_prompt = ?"); values.push(input.systemPrompt); }
    if (input.providerId !== undefined) { fields.push("provider_id = ?"); values.push(input.providerId || null); }
    if (input.model !== undefined) { fields.push("model = ?"); values.push(input.model); }
    if (input.fallbackModels !== undefined) { fields.push("fallback_models = ?"); values.push(JSON.stringify(input.fallbackModels)); }
    if (input.fallbackCooldownSeconds !== undefined) { fields.push("fallback_cooldown_seconds = ?"); values.push(input.fallbackCooldownSeconds); }
    if (input.temperature !== undefined) { fields.push("temperature = ?"); values.push(input.temperature); }
    if (input.maxTokens !== undefined) { fields.push("max_tokens = ?"); values.push(input.maxTokens); }
    if (input.maxIterations !== undefined) { fields.push("max_iterations = ?"); values.push(input.maxIterations); }
    if (input.streaming !== undefined) { fields.push("streaming = ?"); values.push(input.streaming ? 1 : 0); }
    if (input.thinking !== undefined) { fields.push("thinking = ?"); values.push(input.thinking ? 1 : 0); }
    if (input.tools !== undefined) { fields.push("tools = ?"); values.push(JSON.stringify(input.tools)); }
    if (input.skills !== undefined) { fields.push("skills = ?"); values.push(JSON.stringify(input.skills)); }
    if (input.category !== undefined) { fields.push("category = ?"); values.push(normalizeCategory(input.category)); }
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
      workspaceId: row.workspace_id ?? "",
      systemPrompt: row.system_prompt, providerId: row.provider_id ?? undefined,
      model: row.model,
      fallbackModels: parseJsonArray(row.fallback_models).filter((item): item is { providerId?: string; model: string } => {
        return !!item && typeof item === "object" && typeof (item as { model?: unknown }).model === "string";
      }),
      fallbackCooldownSeconds: Number(row.fallback_cooldown_seconds ?? 900),
      temperature: row.temperature, maxTokens: row.max_tokens,
      maxIterations: row.max_iterations, streaming: row.streaming === 1,
      thinking: row.thinking === 1,
      tools: typeof row.tools === "string" ? JSON.parse(row.tools) : (row.tools ?? []),
      skills: typeof row.skills === "string" ? JSON.parse(row.skills) : (row.skills ?? []),
      category: row.category ?? "",
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

  async createSession(agentId: string, options?: { sourceSessionId?: string; workspaceId?: string }): Promise<Session> {
    const id = uuidv4();
    const now = this.nowStr();
    const agent = await this.getAgent(agentId);
    const workspaceId = await this.resolveWorkspaceId(options?.workspaceId ?? agent?.workspaceId);
    let rootSessionId = id;
    if (options?.sourceSessionId) {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        "SELECT id, root_session_id FROM sessions WHERE id = ?",
        [options.sourceSessionId],
      );
      if (rows.length > 0) {
        rootSessionId = rows[0].root_session_id ?? rows[0].id;
      }
    }
    await this.pool.execute(
      "INSERT INTO sessions (id, workspace_id, agent_id, root_session_id, source_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, workspaceId, agentId, rootSessionId, options?.sourceSessionId ?? null, now, now],
    );
    return { id, workspaceId, agentId, rootSessionId, sourceSessionId: options?.sourceSessionId ?? null, createdAt: now, updatedAt: now };
  }

  async getSession(id: string): Promise<Session | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM sessions WHERE id = ?", [id]);
    if (rows.length === 0) return null;
    return this.mapSession(rows[0]);
  }

  async listSessions(agentId?: string, workspaceId?: string): Promise<Session[]> {
    const resolvedWorkspaceId = workspaceId ?? await this.getDefaultWorkspaceId();
    const sessionSql = agentId
      ? "SELECT * FROM sessions WHERE workspace_id = ? AND agent_id = ? ORDER BY updated_at DESC LIMIT 200"
      : "SELECT * FROM sessions WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 200";
    const [sessionRows] = agentId
      ? await this.pool.execute<RowDataPacket[]>(sessionSql, [resolvedWorkspaceId, agentId])
      : await this.pool.execute<RowDataPacket[]>(sessionSql, [resolvedWorkspaceId]);
    if (sessionRows.length === 0) return [];

    const ids = sessionRows.map(r => r.id);
    const ph = ids.map(() => "?").join(",");

    const roots = [...new Set(sessionRows.map(r => r.root_session_id ?? r.id))];
    const rootPh = roots.map(() => "?").join(",");

    const [statRows, msgRows, modelRows, familyRows] = await Promise.all([
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
      this.pool.execute<RowDataPacket[]>(
        `SELECT session_id, JSON_ARRAYAGG(DISTINCT model) as models
         FROM messages WHERE session_id IN (${ph}) AND model IS NOT NULL GROUP BY session_id`, ids
      ).then(r => r[0]),
      this.pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(root_session_id, id) as root_id, COUNT(*) as family_size
         FROM sessions WHERE COALESCE(root_session_id, id) IN (${rootPh})
         GROUP BY COALESCE(root_session_id, id)`, roots
      ).then(r => r[0]),
    ]);

    const statMap = new Map(statRows.map(r => [r.session_id, r]));
    const msgMap = new Map(msgRows.map(r => [r.session_id, r.content]));
    const modelMap = new Map(modelRows.map(r => [r.session_id, parseJsonArray<string>(r.models).filter(Boolean)]));
    const familyMap = new Map(familyRows.map(r => [r.root_id, Number(r.family_size)]));

    return sessionRows.map(r => {
      const st = statMap.get(r.id);
      return {
        id: r.id, workspaceId: r.workspace_id ?? "", agentId: r.agent_id,
        rootSessionId: r.root_session_id ?? r.id,
        sourceSessionId: r.source_session_id ?? null,
        messageCount: st ? Number(st.cnt) : 0,
        totalTokensIn: st ? Number(st.ti) : 0,
        totalTokensOut: st ? Number(st.to2) : 0,
        totalCacheRead: st ? Number(st.cr) : 0,
        firstMessage: msgMap.get(r.id) ?? undefined,
        models: modelMap.get(r.id) ?? [],
        familySize: familyMap.get(r.root_session_id ?? r.id),
        createdAt: String(r.created_at), updatedAt: String(r.updated_at),
      };
    });
  }

  async listSessionFamily(rootSessionId: string): Promise<Session[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT * FROM sessions WHERE COALESCE(root_session_id, id) = ? ORDER BY CASE WHEN source_session_id IS NULL THEN 0 ELSE 1 END, created_at ASC",
      [rootSessionId],
    );
    return rows.map(row => this.mapSession(row));
  }

  async deleteSession(id: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM sessions WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }

  private mapSession(row: RowDataPacket): Session {
    const session: Session = {
      id: row.id, workspaceId: row.workspace_id ?? "", agentId: row.agent_id,
      rootSessionId: row.root_session_id ?? row.id,
      sourceSessionId: row.source_session_id ?? null,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
    if (row.message_count !== undefined) session.messageCount = Number(row.message_count);
    if (row.total_tokens_in !== undefined) session.totalTokensIn = Number(row.total_tokens_in);
    if (row.total_tokens_out !== undefined) session.totalTokensOut = Number(row.total_tokens_out);
    if (row.total_cache_read !== undefined) session.totalCacheRead = Number(row.total_cache_read);
    if (row.first_message !== undefined) session.firstMessage = row.first_message;
    return session;
  }

  // --- Messages ---

  async addMessage(message: Omit<Message, "id" | "createdAt">): Promise<Message> {
    const id = uuidv4();
    const now = this.nowStr();
    const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
    await this.pool.execute(
      `INSERT INTO messages (id, session_id, role, content, thinking, model, model_trace, tokens_in, tokens_out, cache_read_tokens, duration_ms, tool_calls, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, message.sessionId, message.role, content, message.thinking ?? null, message.model ?? null,
       message.modelTrace ? JSON.stringify(message.modelTrace) : null,
       message.tokensIn ?? 0, message.tokensOut ?? 0, message.cacheReadTokens ?? 0,
       message.durationMs ?? 0, message.toolCalls ?? null, now]
    );
    await this.pool.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", [now, message.sessionId]);
    return {
      id, sessionId: message.sessionId, role: message.role, content: message.content,
      thinking: message.thinking, model: message.model, tokensIn: message.tokensIn,
      modelTrace: message.modelTrace,
      tokensOut: message.tokensOut, cacheReadTokens: message.cacheReadTokens,
      durationMs: message.durationMs, toolCalls: message.toolCalls,
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
      modelTrace: parseJsonObject<ModelTrace>(row.model_trace),
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
    const agent = await this.getAgent(log.agentId);
    const workspaceId = log.workspaceId || agent?.workspaceId || await this.getDefaultWorkspaceId();
    await this.pool.execute(
      `INSERT INTO usage_logs (id, workspace_id, agent_id, session_id, tokens_in, tokens_out, model, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, workspaceId, log.agentId, log.sessionId, log.tokensIn, log.tokensOut, log.model, log.durationMs, now]
    );
  }

  async getUsageStats(agentId?: string, workspaceId?: string): Promise<UsageStats> {
    let sql = "SELECT COALESCE(SUM(tokens_in), 0) as total_in, COALESCE(SUM(tokens_out), 0) as total_out, COUNT(*) as total_requests FROM usage_logs WHERE workspace_id = ?";
    const params: SqlParams = [workspaceId ?? await this.getDefaultWorkspaceId()];
    if (agentId) { sql += " AND agent_id = ?"; params.push(agentId); }
    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params);
    const row = rows[0];
    return { totalTokensIn: Number(row.total_in), totalTokensOut: Number(row.total_out), totalRequests: Number(row.total_requests) };
  }

  async getDailyStats(agentId?: string, days: number = 30, startDate?: string, endDate?: string, granularity?: string, workspaceId?: string): Promise<DailyStats[]> {
    const useHourly = granularity === "hour" || (startDate && endDate && startDate === endDate);
    const groupExpr = useHourly
      ? "DATE_FORMAT(created_at, '%Y-%m-%d %H:00')"
      : "DATE(created_at)";
    let sql = `SELECT ${groupExpr} as date, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out, COUNT(*) as requests
      FROM usage_logs WHERE workspace_id = ?`;
    const params: SqlParams = [workspaceId ?? await this.getDefaultWorkspaceId()];
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

  async getSessionCounts(workspaceId?: string): Promise<{ total: number; today: number }> {
    const resolvedWorkspaceId = workspaceId ?? await this.getDefaultWorkspaceId();
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN created_at >= CURDATE() THEN 1 ELSE 0 END) as today
       FROM sessions WHERE workspace_id = ?`,
      [resolvedWorkspaceId],
    );
    return { total: Number(rows[0].total), today: Number(rows[0].today) };
  }

  async getAgentUsageStats(startDate?: string, endDate?: string, workspaceId?: string): Promise<Array<{ agentId: string; totalRequests: number; totalTokensIn: number; totalTokensOut: number }>> {
    let sql = `SELECT agent_id, COUNT(*) as requests, COALESCE(SUM(tokens_in), 0) as tokens_in, COALESCE(SUM(tokens_out), 0) as tokens_out FROM usage_logs WHERE workspace_id = ?`;
    const params: SqlParams = [workspaceId ?? await this.getDefaultWorkspaceId()];
    if (startDate && endDate) {
      sql += " AND DATE(created_at) >= ? AND DATE(created_at) <= ?";
      params.push(startDate, endDate);
    }
    sql += " GROUP BY agent_id ORDER BY requests DESC";
    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params);
    return rows.map(r => ({ agentId: r.agent_id, totalRequests: Number(r.requests), totalTokensIn: Number(r.tokens_in), totalTokensOut: Number(r.tokens_out) }));
  }

  async getModelStats(startDate?: string, endDate?: string, workspaceId?: string): Promise<Array<{ model: string; requests: number; tokensIn: number; tokensOut: number }>> {
    let sql = `SELECT model, COUNT(*) as requests, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out FROM usage_logs WHERE workspace_id = ?`;
    const params: SqlParams = [workspaceId ?? await this.getDefaultWorkspaceId()];
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
    const workspaceId = await this.resolveWorkspaceId(input.workspaceId);
    await this.pool.execute(
      `INSERT INTO http_tools (id, workspace_id, name, description, method, url, headers, parameters, body_template, enabled, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [id, workspaceId, input.name, input.description ?? "", input.method ?? "GET", input.url,
       JSON.stringify(input.headers ?? {}), JSON.stringify(input.parameters ?? { type: "object", properties: {} }),
       input.bodyTemplate ?? "", normalizeCategory(input.category), now, now]
    );
    return (await this.getHttpTool(id))!;
  }

  async getHttpTool(id: string): Promise<HttpTool | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM http_tools WHERE id = ?", [id]);
    if (rows.length === 0) return null;
    return this.mapHttpTool(rows[0]);
  }

  async listHttpTools(workspaceId?: string): Promise<HttpTool[]> {
    const [rows] = workspaceId
      ? await this.pool.execute<RowDataPacket[]>("SELECT * FROM http_tools WHERE workspace_id = ? ORDER BY created_at DESC", [workspaceId])
      : await this.pool.execute<RowDataPacket[]>("SELECT * FROM http_tools ORDER BY created_at DESC");
    return rows.map(r => this.mapHttpTool(r));
  }

  async updateHttpTool(id: string, input: HttpToolUpdateInput): Promise<HttpTool | null> {
    const existing = await this.getHttpTool(id);
    if (!existing) return null;
    const fields: string[] = [];
    const values: SqlParams = [];
    if (input.workspaceId !== undefined) { fields.push("workspace_id = ?"); values.push(input.workspaceId); }
    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (input.method !== undefined) { fields.push("method = ?"); values.push(input.method); }
    if (input.url !== undefined) { fields.push("url = ?"); values.push(input.url); }
    if (input.headers !== undefined) { fields.push("headers = ?"); values.push(JSON.stringify(input.headers)); }
    if (input.parameters !== undefined) { fields.push("parameters = ?"); values.push(JSON.stringify(input.parameters)); }
    if (input.bodyTemplate !== undefined) { fields.push("body_template = ?"); values.push(input.bodyTemplate); }
    if (input.enabled !== undefined) { fields.push("enabled = ?"); values.push(input.enabled ? 1 : 0); }
    if (input.category !== undefined) { fields.push("category = ?"); values.push(normalizeCategory(input.category)); }
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
      id: row.id, workspaceId: row.workspace_id ?? "", name: row.name, description: row.description ?? "",
      method: row.method, url: row.url,
      headers: typeof row.headers === "string" ? JSON.parse(row.headers) : (row.headers ?? {}),
      parameters: typeof row.parameters === "string" ? JSON.parse(row.parameters) : (row.parameters ?? {}),
      bodyTemplate: row.body_template ?? "", enabled: row.enabled === 1,
      category: row.category ?? "",
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  async listSkillCategories(workspaceId?: string): Promise<Record<string, string>> {
    const resolvedWorkspaceId = workspaceId ?? await this.getDefaultWorkspaceId();
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT skill_name, category FROM workspace_skill_categories WHERE workspace_id = ?", [resolvedWorkspaceId]);
    return Object.fromEntries(rows.map(row => [row.skill_name as string, row.category as string]));
  }

  async setSkillCategory(skillName: string, category: string, workspaceId?: string): Promise<void> {
    const resolvedWorkspaceId = workspaceId ?? await this.getDefaultWorkspaceId();
    const normalized = category.trim();
    if (!normalized) {
      await this.pool.execute("DELETE FROM workspace_skill_categories WHERE workspace_id = ? AND skill_name = ?", [resolvedWorkspaceId, skillName]);
      return;
    }
    await this.pool.execute(
      `INSERT INTO workspace_skill_categories (workspace_id, skill_name, category, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE category = VALUES(category), updated_at = NOW()`,
      [resolvedWorkspaceId, skillName, normalized],
    );
  }

  // --- Providers ---

  async createProvider(input: ProviderCreateInput): Promise<ProviderConfig> {
    const id = uuidv4();
    const now = this.nowStr();
    const workspaceId = await this.resolveWorkspaceId(input.workspaceId);
    if (input.isPrimary) {
      await this.pool.execute("UPDATE providers SET is_primary = 0 WHERE workspace_id = ?", [workspaceId]);
    }
    await this.pool.execute(
      `INSERT INTO providers (id, workspace_id, name, type, api_key, base_url, default_model, capabilities, enabled, is_primary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, workspaceId, input.name, input.type, input.apiKey, input.baseUrl ?? null, input.defaultModel,
       JSON.stringify(normalizeModelCapabilities(input.type, input.capabilities)),
       input.enabled !== false ? 1 : 0, input.isPrimary ? 1 : 0, now, now]
    );
    return (await this.getProvider(id))!;
  }

  async getProvider(id: string): Promise<ProviderConfig | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM providers WHERE id = ?", [id]);
    if (rows.length === 0) return null;
    return this.mapProvider(rows[0]);
  }

  async listProviders(workspaceId?: string): Promise<ProviderConfig[]> {
    const [rows] = workspaceId
      ? await this.pool.execute<RowDataPacket[]>("SELECT * FROM providers WHERE workspace_id = ? ORDER BY is_primary DESC, created_at ASC", [workspaceId])
      : await this.pool.execute<RowDataPacket[]>("SELECT * FROM providers ORDER BY is_primary DESC, created_at ASC");
    return rows.map(r => this.mapProvider(r));
  }

  async updateProvider(id: string, input: ProviderUpdateInput): Promise<ProviderConfig | null> {
    const existing = await this.getProvider(id);
    if (!existing) return null;
    if (input.isPrimary) {
      await this.pool.execute("UPDATE providers SET is_primary = 0 WHERE workspace_id = ?", [input.workspaceId ?? existing.workspaceId]);
    }
    const fields: string[] = [];
    const values: SqlParams = [];
    if (input.workspaceId !== undefined) { fields.push("workspace_id = ?"); values.push(input.workspaceId); }
    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.type !== undefined) { fields.push("type = ?"); values.push(input.type); }
    if (input.apiKey !== undefined) { fields.push("api_key = ?"); values.push(input.apiKey); }
    if (input.baseUrl !== undefined) { fields.push("base_url = ?"); values.push(input.baseUrl || null); }
    if (input.defaultModel !== undefined) { fields.push("default_model = ?"); values.push(input.defaultModel); }
    if (input.capabilities !== undefined) { fields.push("capabilities = ?"); values.push(JSON.stringify(normalizeModelCapabilities(input.type ?? existing.type, input.capabilities))); }
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

  async getPrimaryProvider(workspaceId?: string): Promise<ProviderConfig | null> {
    const resolvedWorkspaceId = workspaceId ?? await this.getDefaultWorkspaceId();
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM providers WHERE workspace_id = ? AND is_primary = 1 AND enabled = 1 LIMIT 1", [resolvedWorkspaceId]);
    if (rows.length > 0) return this.mapProvider(rows[0]);
    const [fallback] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM providers WHERE workspace_id = ? AND enabled = 1 LIMIT 1", [resolvedWorkspaceId]);
    return fallback.length > 0 ? this.mapProvider(fallback[0]) : null;
  }

  private mapProvider(row: RowDataPacket): ProviderConfig {
    return {
      id: row.id, workspaceId: row.workspace_id ?? "", name: row.name, type: row.type, apiKey: row.api_key,
      baseUrl: row.base_url ?? undefined, defaultModel: row.default_model,
      capabilities: normalizeModelCapabilities(row.type, parseJsonObject<Partial<ModelCapabilities>>(row.capabilities)),
      enabled: row.enabled === 1, isPrimary: row.is_primary === 1,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  // --- Knowledge Bases ---

  async createKnowledgeBase(input: KnowledgeBaseCreateInput): Promise<KnowledgeBase> {
    const id = uuidv4();
    const now = this.nowStr();
    const workspaceId = await this.resolveWorkspaceId(input.workspaceId);
    await this.pool.execute(
      "INSERT INTO knowledge_bases (id, workspace_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, workspaceId, input.name, input.description ?? "", now, now]
    );
    return { id, workspaceId, name: input.name, description: input.description ?? "", createdAt: now, updatedAt: now };
  }

  async getKnowledgeBase(id: string): Promise<KnowledgeBase | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM knowledge_bases WHERE id = ?", [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, workspaceId: r.workspace_id ?? "", name: r.name, description: r.description ?? "", createdAt: String(r.created_at), updatedAt: String(r.updated_at) };
  }

  async listKnowledgeBases(workspaceId?: string): Promise<KnowledgeBase[]> {
    const resolvedWorkspaceId = workspaceId ?? await this.getDefaultWorkspaceId();
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM knowledge_bases WHERE workspace_id = ? ORDER BY created_at DESC", [resolvedWorkspaceId]);
    return rows.map(r => ({ id: r.id, workspaceId: r.workspace_id ?? "", name: r.name, description: r.description ?? "", createdAt: String(r.created_at), updatedAt: String(r.updated_at) }));
  }

  async updateKnowledgeBase(id: string, input: KnowledgeBaseUpdateInput): Promise<KnowledgeBase | null> {
    const existing = await this.getKnowledgeBase(id);
    if (!existing) return null;
    const fields: string[] = [];
    const values: SqlParams = [];
    if (input.workspaceId !== undefined) { fields.push("workspace_id = ?"); values.push(input.workspaceId); }
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
    const provider = await this.getProvider(providerId);
    const workspaceId = provider?.workspaceId ?? await this.getDefaultWorkspaceId();
    const raw = randomBytes(16).toString("hex");
    const rawKey = `af-ch-${raw}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 10);
    const now = this.nowStr();
    await this.pool.execute(
      `INSERT INTO provider_channels (id, workspace_id, provider_id, name, key_hash, key_prefix, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, workspaceId, providerId, name, keyHash, keyPrefix, now, now]
    );
    return {
      channel: { id, workspaceId, providerId, name, keyHash, keyPrefix, enabled: true, createdAt: now, updatedAt: now },
      rawKey,
    };
  }

  async getChannelByHash(keyHash: string): Promise<(ProviderChannel & { providerConfig: ProviderConfig }) | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT pc.*, p.id as p_id, p.workspace_id as p_workspace_id, p.name as p_name, p.type as p_type, p.api_key as p_api_key,
              p.base_url as p_base_url, p.default_model as p_default_model, p.enabled as p_enabled,
              p.capabilities as p_capabilities, p.is_primary as p_is_primary,
              p.created_at as p_created_at, p.updated_at as p_updated_at
       FROM provider_channels pc JOIN providers p ON p.id = pc.provider_id
       WHERE pc.key_hash = ? AND pc.enabled = 1`, [keyHash]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id, providerId: r.provider_id, name: r.name, keyHash: r.key_hash,
      workspaceId: r.workspace_id ?? "", keyPrefix: r.key_prefix, enabled: r.enabled === 1,
      createdAt: String(r.created_at), updatedAt: String(r.updated_at),
      providerConfig: {
        id: r.p_id, workspaceId: r.p_workspace_id ?? "", name: r.p_name, type: r.p_type, apiKey: r.p_api_key,
        baseUrl: r.p_base_url ?? undefined, defaultModel: r.p_default_model,
        capabilities: normalizeModelCapabilities(r.p_type, parseJsonObject<Partial<ModelCapabilities>>(r.p_capabilities)),
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
      workspaceId: r.workspace_id ?? "", keyPrefix: r.key_prefix, enabled: r.enabled === 1,
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
    const provider = await this.getProvider(log.providerId);
    const workspaceId = log.workspaceId || provider?.workspaceId || await this.getDefaultWorkspaceId();
    await this.pool.execute(
      `INSERT INTO proxy_usage_logs (id, workspace_id, channel_id, provider_id, model, tokens_in, tokens_out, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, workspaceId, log.channelId, log.providerId, log.model, log.tokensIn, log.tokensOut, log.durationMs, now]
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

  async getProviderChannelStats(providerId: string, startDate?: string, endDate?: string, workspaceId?: string): Promise<Array<{ channelId: string; channelName: string; totalRequests: number; totalTokensIn: number; totalTokensOut: number }>> {
    let joinCondition = "pu.channel_id = pc.id";
    const params: SqlParams = [];
    if (startDate && endDate) {
      joinCondition += " AND DATE(pu.created_at) >= ? AND DATE(pu.created_at) <= ?";
      params.push(startDate, endDate);
    }
    if (workspaceId) {
      joinCondition += " AND pu.workspace_id = ?";
      params.push(workspaceId);
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

  async getProxyDailyStats(days: number = 30, startDate?: string, endDate?: string, granularity?: string, workspaceId?: string): Promise<DailyStats[]> {
    const useHourly = granularity === "hour" || (startDate && endDate && startDate === endDate);
    const groupExpr = useHourly
      ? "DATE_FORMAT(created_at, '%Y-%m-%d %H:00')"
      : "DATE(created_at)";
    let sql = `SELECT ${groupExpr} as date, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out, COUNT(*) as requests
       FROM proxy_usage_logs WHERE workspace_id = ?`;
    const params: SqlParams = [workspaceId ?? await this.getDefaultWorkspaceId()];
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

  async getProxyOverview(workspaceId?: string): Promise<{ totalRequests: number; totalTokensIn: number; totalTokensOut: number; totalChannels: number }> {
    const resolvedWorkspaceId = workspaceId ?? await this.getDefaultWorkspaceId();
    const [[usageRows], [channelRows]] = await Promise.all([
      this.pool.execute<RowDataPacket[]>("SELECT COUNT(*) as cnt, COALESCE(SUM(tokens_in),0) as ti, COALESCE(SUM(tokens_out),0) as to2 FROM proxy_usage_logs WHERE workspace_id = ?", [resolvedWorkspaceId]),
      this.pool.execute<RowDataPacket[]>("SELECT COUNT(*) as cnt FROM provider_channels WHERE workspace_id = ?", [resolvedWorkspaceId]),
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
