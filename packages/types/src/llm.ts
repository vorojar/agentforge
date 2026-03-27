import type { ContentBlock } from "./message.js";
import type { ToolDefinition } from "./tool.js";

export interface LLMRequest {
  model: string;
  systemPrompt: string;
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export interface LLMMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface LLMResponse {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  model: string;
  usage: LLMUsage;
}

export interface LLMStreamChunk {
  type: "text" | "thinking" | "tool_use_start" | "tool_use_delta" | "tool_use_end" | "done";
  text?: string;
  toolUse?: {
    id: string;
    name: string;
    input: string;
  };
  usage?: LLMUsage;
  stopReason?: "end_turn" | "tool_use" | "max_tokens";
}

export interface LLMUsage {
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface LLMProvider {
  readonly name: string;
  chat(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest): AsyncIterable<LLMStreamChunk>;
}
