export interface ProviderConfig {
  id: string;
  name: string;           // Display name, e.g. "火山引擎 (豆包)"
  type: string;           // "openai" | "claude"
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  enabled: boolean;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderCreateInput {
  name: string;
  type: string;
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  enabled?: boolean;
  isPrimary?: boolean;
}

export interface ProviderUpdateInput {
  name?: string;
  type?: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  enabled?: boolean;
  isPrimary?: boolean;
}
