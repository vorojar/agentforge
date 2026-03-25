import type { ToolParameterSchema } from "./tool.js";

export interface HttpTool {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  parameters: ToolParameterSchema;
  bodyTemplate: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HttpToolCreateInput {
  name: string;
  description?: string;
  method?: string;
  url: string;
  headers?: Record<string, string>;
  parameters?: ToolParameterSchema;
  bodyTemplate?: string;
}

export interface HttpToolUpdateInput {
  name?: string;
  description?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  parameters?: ToolParameterSchema;
  bodyTemplate?: string;
  enabled?: boolean;
}
