import type { LLMProvider } from "@agentforge/types";
import { ClaudeProvider } from "./claude.js";
import { OpenAIProvider } from "./openai.js";

export function createProvider(
  type: string,
  config: { apiKey: string; baseUrl?: string }
): LLMProvider {
  switch (type) {
    case "claude":
      return new ClaudeProvider(config);
    case "openai":
      return new OpenAIProvider(config);
    default:
      throw new Error(`Unknown provider: ${type}`);
  }
}
