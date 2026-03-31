import type { AgentConfig, LLMMessage, SkillRegistry } from "@agentforge/types";
import { estimateTokens, estimateMessagesTokens } from "./token-utils.js";
import { loadSkillContent } from "@agentforge/skills";

export class ContextBuilder {
  constructor(
    private config: AgentConfig,
    private skillRegistry?: SkillRegistry
  ) {}

  build(
    history: LLMMessage[],
    userInput?: string,
    maxHistoryTokens: number = 80000
  ): { systemPrompt: string; messages: LLMMessage[] } {
    let systemPrompt = this.config.systemPrompt;

    // Append matched skill content if available
    if (
      userInput &&
      this.skillRegistry &&
      this.config.skills.length > 0
    ) {
      const match = this.skillRegistry.match(userInput);
      if (match && match.score >= 0.15) {
        // Lazy load full content from filesystem (supports hot editing)
        const content = loadSkillContent(match.skill);
        systemPrompt += `\n\n## Skill: ${match.skill.name}\n${content}`;
      }
    }

    const systemTokens = estimateTokens(systemPrompt);

    // History truncation: drop oldest messages if over token budget,
    // but always keep at least the last 10 turns.
    let messages = [...history];
    let totalTokens = systemTokens + estimateMessagesTokens(messages);
    const minKeep = 10;
    let trimmed = false;

    while (messages.length > minKeep && totalTokens > maxHistoryTokens) {
      const removed = messages.shift()!;
      const removedTokens =
        typeof removed.content === "string"
          ? estimateTokens(removed.content)
          : estimateMessagesTokens([removed]);
      totalTokens -= removedTokens;
      trimmed = true;
    }

    if (trimmed) {
      messages.unshift({
        role: "user",
        content: "[Earlier conversation history was trimmed to fit context window]",
      });
    }

    // Tool result truncation (micro-compact): keep last 3 tool_result
    // content blocks intact, truncate older ones to 200 chars.
    let toolResultCount = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "user" || typeof msg.content === "string") continue;
      const blocks = msg.content;
      let mutated = false;
      for (let j = blocks.length - 1; j >= 0; j--) {
        const block = blocks[j];
        if (block.type !== "tool_result") continue;
        toolResultCount++;
        if (toolResultCount > 3 && block.content.length > 200) {
          if (!mutated) {
            // Shallow-copy the blocks array on first mutation
            messages[i] = { ...msg, content: [...blocks] };
            mutated = true;
          }
          (messages[i].content as typeof blocks)[j] = {
            ...block,
            content: block.content.slice(0, 200) + "... [truncated]",
          };
        }
      }
    }

    return { systemPrompt, messages };
  }
}
