import type { ModelTrace } from "./llm.js";

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | ToolUseBlock
  | ToolResultBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

/** 图片块，支持 base64 内联或 URL 引用两种方式 */
export interface ImageBlock {
  type: "image";
  /** base64 内联：提供 data + mediaType；URL 引用：提供 url */
  source:
    | { type: "base64"; data: string; mediaType: string }
    | { type: "url"; url: string };
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  /** AI 思考过程文本（仅 assistant 消息） */
  thinking?: string;
  model?: string;
  modelTrace?: ModelTrace;
  tokensIn?: number;
  tokensOut?: number;
  cacheReadTokens?: number;
  durationMs?: number;
  toolCalls?: string;
  createdAt: string;
}

export interface Session {
  id: string;
  workspaceId: string;
  agentId: string;
  rootSessionId?: string;
  sourceSessionId?: string | null;
  messageCount?: number;
  totalTokensIn?: number;
  totalTokensOut?: number;
  totalCacheRead?: number;
  firstMessage?: string;
  models?: string[];
  familySize?: number;
  createdAt: string;
  updatedAt: string;
}
