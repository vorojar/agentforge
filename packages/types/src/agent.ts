export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  providerId?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxIterations: number;
  streaming: boolean;
  tools: string[];
  skills: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentCreateInput {
  name: string;
  description?: string;
  systemPrompt: string;
  providerId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxIterations?: number;
  streaming?: boolean;
  tools?: string[];
  skills?: string[];
}

export interface AgentUpdateInput {
  name?: string;
  description?: string;
  systemPrompt?: string;
  providerId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxIterations?: number;
  streaming?: boolean;
  tools?: string[];
  skills?: string[];
  enabled?: boolean;
}
