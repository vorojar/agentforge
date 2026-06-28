/**
 * 数据库适配器接口定义
 * 功能：所有 PostgreSQL 数据库操作的抽象接口
 * 创建时间：2026-03-31
 * 负责人：王觉贤
 * 最后更新时间：2026-03-31
 */

import type { AgentConfig, AgentCreateInput, AgentUpdateInput } from "./agent.js";
import type { Message, Session } from "./message.js";
import type { HttpTool, HttpToolCreateInput, HttpToolUpdateInput } from "./http-tool.js";
import type { ProviderConfig, ProviderCreateInput, ProviderUpdateInput } from "./provider-config.js";
import type { KnowledgeBase, KnowledgeBaseCreateInput, KnowledgeBaseUpdateInput, KnowledgeSource, KnowledgeSearchResult } from "./knowledge-base.js";
import type { ProviderChannel, ProxyUsageLog, ChannelStats } from "./provider-channel.js";
import type {
  AuditLog,
  AuditLogInput,
  AuthSession,
  IdentityProviderConfig,
  IdentityProviderCreateInput,
  Membership,
  MembershipInput,
  Organization,
  OrganizationCreateInput,
  TenantBootstrapResult,
  UserAccount,
  UserCreateInput,
  UserPassword,
  Workspace,
  WorkspaceCreateInput,
} from "./tenant.js";

export interface ApiKey {
  id: string;
  agentId: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface UsageLog {
  id: string;
  workspaceId?: string;
  agentId: string;
  sessionId: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  durationMs: number;
  createdAt: string;
}

export interface UsageStats {
  totalTokensIn: number;
  totalTokensOut: number;
  totalRequests: number;
}

export interface DailyStats {
  date: string;
  tokensIn: number;
  tokensOut: number;
  requests: number;
}

export interface DatabaseAdapter {
  // Tenant foundation
  ensureDefaultTenant(): Promise<TenantBootstrapResult>;
  createOrganization(input: OrganizationCreateInput): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | null>;
  listOrganizations(): Promise<Organization[]>;
  createWorkspace(input: WorkspaceCreateInput): Promise<Workspace>;
  getWorkspace(id: string): Promise<Workspace | null>;
  listWorkspaces(organizationId?: string): Promise<Workspace[]>;
  createUser(input: UserCreateInput): Promise<UserAccount>;
  getUser(id: string): Promise<UserAccount | null>;
  getUserByEmail(email: string): Promise<UserAccount | null>;
  listUsers(): Promise<UserAccount[]>;
  setUserPassword(userId: string, passwordHash: string): Promise<UserPassword>;
  getUserPassword(userId: string): Promise<UserPassword | null>;
  updateUserLastLogin(userId: string): Promise<void>;
  createAuthSession(userId: string, tokenHash: string, expiresAt: string): Promise<AuthSession>;
  getAuthSessionByHash(tokenHash: string): Promise<AuthSession | null>;
  deleteAuthSessionByHash(tokenHash: string): Promise<boolean>;
  deleteExpiredAuthSessions(): Promise<void>;
  upsertMembership(input: MembershipInput): Promise<Membership>;
  listMemberships(organizationId: string, workspaceId?: string | null): Promise<Membership[]>;
  createIdentityProvider(input: IdentityProviderCreateInput): Promise<IdentityProviderConfig>;
  listIdentityProviders(organizationId: string): Promise<IdentityProviderConfig[]>;
  createAuditLog(input: AuditLogInput): Promise<AuditLog>;
  listAuditLogs(organizationId: string, options?: { workspaceId?: string; limit?: number }): Promise<AuditLog[]>;

  // Agents
  createAgent(input: AgentCreateInput): Promise<AgentConfig>;
  getAgent(id: string): Promise<AgentConfig | null>;
  listAgents(workspaceId?: string): Promise<AgentConfig[]>;
  updateAgent(id: string, input: AgentUpdateInput): Promise<AgentConfig | null>;
  deleteAgent(id: string): Promise<boolean>;

  // API Keys
  createApiKey(agentId: string, name?: string): Promise<{ apiKey: ApiKey; rawKey: string }>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | null>;
  listApiKeys(agentId: string): Promise<ApiKey[]>;
  deleteApiKey(id: string): Promise<boolean>;
  touchApiKey(id: string): Promise<void>;

  // Sessions
  createSession(agentId: string, options?: { sourceSessionId?: string; workspaceId?: string }): Promise<Session>;
  getSession(id: string): Promise<Session | null>;
  listSessions(agentId?: string, workspaceId?: string): Promise<Session[]>;
  listSessionFamily(rootSessionId: string): Promise<Session[]>;
  deleteSession(id: string): Promise<boolean>;

  // Messages
  addMessage(message: Omit<Message, "id" | "createdAt">): Promise<Message>;
  getMessages(sessionId: string): Promise<Message[]>;

  // Usage
  logUsage(log: Omit<UsageLog, "id" | "createdAt">): Promise<void>;
  getUsageStats(agentId?: string, workspaceId?: string): Promise<UsageStats>;
  getDailyStats(agentId?: string, days?: number, startDate?: string, endDate?: string, granularity?: string, workspaceId?: string): Promise<DailyStats[]>;
  getSessionCounts(workspaceId?: string): Promise<{ total: number; today: number }>;
  getModelStats(startDate?: string, endDate?: string, workspaceId?: string): Promise<Array<{ model: string; requests: number; tokensIn: number; tokensOut: number }>>;
  getAgentUsageStats(startDate?: string, endDate?: string, workspaceId?: string): Promise<Array<{ agentId: string; totalRequests: number; totalTokensIn: number; totalTokensOut: number }>>;

  // HTTP Tools
  createHttpTool(input: HttpToolCreateInput): Promise<HttpTool>;
  getHttpTool(id: string): Promise<HttpTool | null>;
  listHttpTools(workspaceId?: string): Promise<HttpTool[]>;
  updateHttpTool(id: string, input: HttpToolUpdateInput): Promise<HttpTool | null>;
  deleteHttpTool(id: string): Promise<boolean>;

  // Skill Categories
  listSkillCategories(workspaceId?: string): Promise<Record<string, string>>;
  setSkillCategory(skillName: string, category: string, workspaceId?: string): Promise<void>;

  // Providers
  createProvider(input: ProviderCreateInput): Promise<ProviderConfig>;
  getProvider(id: string): Promise<ProviderConfig | null>;
  listProviders(workspaceId?: string): Promise<ProviderConfig[]>;
  updateProvider(id: string, input: ProviderUpdateInput): Promise<ProviderConfig | null>;
  deleteProvider(id: string): Promise<boolean>;
  getPrimaryProvider(workspaceId?: string): Promise<ProviderConfig | null>;

  // Knowledge Bases
  createKnowledgeBase(input: KnowledgeBaseCreateInput): Promise<KnowledgeBase>;
  getKnowledgeBase(id: string): Promise<KnowledgeBase | null>;
  listKnowledgeBases(workspaceId?: string): Promise<KnowledgeBase[]>;
  updateKnowledgeBase(id: string, input: KnowledgeBaseUpdateInput): Promise<KnowledgeBase | null>;
  deleteKnowledgeBase(id: string): Promise<boolean>;

  // Agent-Knowledge association
  setAgentKnowledge(agentId: string, kbIds: string[]): Promise<void>;
  getAgentKnowledge(agentId: string): Promise<string[]>;

  // Knowledge Sources & Chunks (now keyed by kbId)
  ingestKnowledge(kbId: string, sourceName: string, rawContent: string, chunks: string[], embeddings?: number[][]): Promise<number>;
  searchKnowledge(kbIds: string[], query: string, limit?: number, queryEmbedding?: number[]): Promise<KnowledgeSearchResult[]>;
  listKnowledgeSources(kbId: string): Promise<KnowledgeSource[]>;
  getKnowledgeSourceContent(kbId: string, sourceName: string): Promise<string | null>;
  renameKnowledgeSource(kbId: string, oldName: string, newName: string): Promise<boolean>;
  deleteKnowledgeSource(kbId: string, sourceName: string): Promise<boolean>;

  // Provider Channels
  createChannel(providerId: string, name: string): Promise<{ channel: ProviderChannel; rawKey: string }>;
  getChannelByHash(keyHash: string): Promise<(ProviderChannel & { providerConfig: ProviderConfig }) | null>;
  listChannels(providerId: string): Promise<ProviderChannel[]>;
  deleteChannel(id: string): Promise<boolean>;

  // Proxy Usage
  logProxyUsage(log: ProxyUsageLog): Promise<void>;
  getChannelStats(channelId: string, days?: number): Promise<ChannelStats>;
  getProviderChannelStats(providerId: string, startDate?: string, endDate?: string, workspaceId?: string): Promise<Array<{ channelId: string; channelName: string; totalRequests: number; totalTokensIn: number; totalTokensOut: number }>>;
  getProxyDailyStats(days?: number, startDate?: string, endDate?: string, granularity?: string, workspaceId?: string): Promise<DailyStats[]>;
  getProxyOverview(workspaceId?: string): Promise<{ totalRequests: number; totalTokensIn: number; totalTokensOut: number; totalChannels: number }>;

  // Lifecycle
  close(): Promise<void>;
}
