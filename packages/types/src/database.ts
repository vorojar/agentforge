import type { AgentConfig, AgentCreateInput, AgentUpdateInput } from "./agent.js";
import type { Message, Session } from "./message.js";
import type { HttpTool, HttpToolCreateInput, HttpToolUpdateInput } from "./http-tool.js";
import type { ProviderConfig, ProviderCreateInput, ProviderUpdateInput } from "./provider-config.js";

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
  // Agents
  createAgent(input: AgentCreateInput): AgentConfig;
  getAgent(id: string): AgentConfig | null;
  listAgents(): AgentConfig[];
  updateAgent(id: string, input: AgentUpdateInput): AgentConfig | null;
  deleteAgent(id: string): boolean;

  // API Keys
  createApiKey(agentId: string, name?: string): { apiKey: ApiKey; rawKey: string };
  getApiKeyByHash(keyHash: string): ApiKey | null;
  listApiKeys(agentId: string): ApiKey[];
  deleteApiKey(id: string): boolean;
  touchApiKey(id: string): void;

  // Sessions
  createSession(agentId: string): Session;
  getSession(id: string): Session | null;
  listSessions(agentId?: string): Session[];
  deleteSession(id: string): boolean;

  // Messages
  addMessage(message: Omit<Message, "id" | "createdAt">): Message;
  getMessages(sessionId: string): Message[];

  // Usage
  logUsage(log: Omit<UsageLog, "id" | "createdAt">): void;
  getUsageStats(agentId?: string): UsageStats;
  getDailyStats(agentId?: string, days?: number): DailyStats[];
  getSessionCounts(): { total: number; today: number };
  getModelStats(): Array<{ model: string; requests: number; tokensIn: number; tokensOut: number }>;
  getAgentUsageStats(): Array<{ agentId: string; totalRequests: number; totalTokensIn: number; totalTokensOut: number }>;

  // HTTP Tools
  createHttpTool(input: HttpToolCreateInput): HttpTool;
  getHttpTool(id: string): HttpTool | null;
  listHttpTools(): HttpTool[];
  updateHttpTool(id: string, input: HttpToolUpdateInput): HttpTool | null;
  deleteHttpTool(id: string): boolean;

  // Providers
  createProvider(input: ProviderCreateInput): ProviderConfig;
  getProvider(id: string): ProviderConfig | null;
  listProviders(): ProviderConfig[];
  updateProvider(id: string, input: ProviderUpdateInput): ProviderConfig | null;
  deleteProvider(id: string): boolean;
  getPrimaryProvider(): ProviderConfig | null;

  // Lifecycle
  close(): void;
}
