export interface AgentFallbackModel {
  providerId?: string;
  model: string;
}

export interface AgentConfig {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  systemPrompt: string;
  providerId?: string;
  model: string;
  fallbackModels: AgentFallbackModel[];
  fallbackCooldownSeconds: number;
  temperature: number;
  maxTokens: number;
  maxIterations: number;
  streaming: boolean;
  /** 是否启用 AI 扩展思考（Extended Thinking） */
  thinking: boolean;
  tools: string[];
  skills: string[];
  category: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentCreateInput {
  workspaceId?: string;
  name: string;
  description?: string;
  systemPrompt: string;
  providerId?: string;
  model?: string;
  fallbackModels?: AgentFallbackModel[];
  fallbackCooldownSeconds?: number;
  temperature?: number;
  maxTokens?: number;
  maxIterations?: number;
  streaming?: boolean;
  thinking?: boolean;
  tools?: string[];
  skills?: string[];
  category?: string;
}

export interface AgentUpdateInput {
  workspaceId?: string;
  name?: string;
  description?: string;
  systemPrompt?: string;
  providerId?: string;
  model?: string;
  fallbackModels?: AgentFallbackModel[];
  fallbackCooldownSeconds?: number;
  temperature?: number;
  maxTokens?: number;
  maxIterations?: number;
  streaming?: boolean;
  thinking?: boolean;
  tools?: string[];
  skills?: string[];
  category?: string;
  enabled?: boolean;
}
