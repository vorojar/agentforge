import type { LLMMessage } from "@agentforge/types";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: LLMMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      total += estimateTokens(msg.content);
    } else {
      for (const block of msg.content) {
        if (block.type === "text") {
          total += estimateTokens(block.text);
        } else if (block.type === "tool_use") {
          total += estimateTokens(JSON.stringify(block.input));
        } else if (block.type === "tool_result") {
          total += estimateTokens(block.content);
        }
      }
    }
  }
  return total;
}
