export interface ModelCapabilities {
  supportsTools: boolean;
  supportsVision: boolean;
  supportsThinking: boolean;
  supportsStreaming: boolean;
}

export interface ProviderConfig {
  id: string;
  workspaceId: string;
  name: string;           // Display name, e.g. "火山引擎 (豆包)"
  type: string;           // "openai" | "claude"
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  capabilities: ModelCapabilities;
  enabled: boolean;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderCreateInput {
  workspaceId?: string;
  name: string;
  type: string;
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  capabilities?: Partial<ModelCapabilities>;
  enabled?: boolean;
  isPrimary?: boolean;
}

export interface ProviderUpdateInput {
  workspaceId?: string;
  name?: string;
  type?: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  capabilities?: Partial<ModelCapabilities>;
  enabled?: boolean;
  isPrimary?: boolean;
}
