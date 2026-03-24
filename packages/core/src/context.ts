import type { AgentConfig, LLMMessage, SkillRegistry } from "@agentforge/types";
import { estimateTokens, estimateMessagesTokens } from "./token-utils.js";

export class ContextBuilder {
  constructor(
    private config: AgentConfig,
    private skillRegistry?: SkillRegistry
  ) {}

  build(
    history: LLMMessage[],
    userInput?: string
  ): { systemPrompt: string; messages: LLMMessage[] } {
    let systemPrompt = this.config.systemPrompt;

    // Append matched skill content if available
    if (
      userInput &&
      this.skillRegistry &&
      this.config.skills.length > 0
    ) {
      const match = this.skillRegistry.match(userInput);
      if (match && match.score > 0) {
        systemPrompt += `\n\n## Skill: ${match.skill.name}\n${match.skill.content}`;
      }
    }

    // Estimate context window budget: 80% of maxTokens * 8
    const contextBudget = Math.floor(this.config.maxTokens * 8 * 0.8);
    const systemTokens = estimateTokens(systemPrompt);

    // Truncate old messages if over budget, keeping recent ones
    let messages = [...history];
    let totalTokens = systemTokens + estimateMessagesTokens(messages);

    while (messages.length > 1 && totalTokens > contextBudget) {
      const removed = messages.shift()!;
      const removedTokens =
        typeof removed.content === "string"
          ? estimateTokens(removed.content)
          : estimateMessagesTokens([removed]);
      totalTokens -= removedTokens;
    }

    return { systemPrompt, messages };
  }
}
