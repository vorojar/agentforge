import type { AgentConfig, AgentCreateInput, AgentUpdateInput } from "./agent.js";
import type { Skill, SkillCreateInput, SkillUpdateInput } from "./skill.js";
import type { Message, Session } from "./message.js";

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

  // Skills
  createSkill(input: SkillCreateInput): Skill;
  getSkill(id: string): Skill | null;
  getSkillByName(name: string): Skill | null;
  listSkills(): Skill[];
  updateSkill(id: string, input: SkillUpdateInput): Skill | null;
  deleteSkill(id: string): boolean;

  // Lifecycle
  close(): void;
}
