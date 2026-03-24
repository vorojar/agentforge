export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface ToolExecutionContext {
  agentId?: string;
  sessionId?: string;
  workDir?: string;
}

export interface Tool extends ToolDefinition {
  execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult>;
}

export interface ToolHook {
  before?(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown> | null>;
  after?(
    toolName: string,
    input: Record<string, unknown>,
    result: ToolResult
  ): Promise<ToolResult>;
}

export interface ToolPolicy {
  allow?: string[];
  deny?: string[];
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  getDefinitions(): ToolDefinition[];
  getByNames(names: string[]): Tool[];
}
