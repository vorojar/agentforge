import type { AgentConfig, LLMMessage, Skill, SkillRegistry } from "@agentforge/types";
import { estimateTokens, estimateMessagesTokens } from "./token-utils.js";

export class ContextBuilder {
  constructor(
    private config: AgentConfig,
    private skillRegistry?: SkillRegistry
  ) {}

  /** Generate a concise skill catalog summary for System Prompt injection */
  private buildSkillCatalog(skillNames: string[]): string | null {
    if (!this.skillRegistry || skillNames.length === 0) return null;

    const entries: string[] = [];
    for (const name of skillNames) {
      let skill: Skill | undefined = this.skillRegistry.get(name);
      if (!skill) {
        const all = this.skillRegistry.list();
        skill = all.find((s) => s.id === name);
      }
      if (!skill) continue;

      const filesLine = skill.availableFiles?.length
        ? `Available files: ${skill.availableFiles.join(", ")}`
        : "";
      entries.push(
        `### ${skill.id}\n${skill.description}${filesLine ? "\n" + filesLine : ""}`
      );
    }

    if (entries.length === 0) return null;

    return [
      "## Available Skills",
      "",
      "You have access to the following skills. Use the `get_skill_content` tool to load detailed instructions, examples, or references when needed.",
      "",
      ...entries,
    ].join("\n");
  }

  build(
    history: LLMMessage[],
    _userInput?: string,
    maxHistoryTokens: number = 80000
  ): { systemPrompt: string; messages: LLMMessage[] } {
    let systemPrompt = this.config.systemPrompt;

    // Inject skill catalog summary (not full content)
    if (this.skillRegistry && this.config.skills.length > 0) {
      const catalog = this.buildSkillCatalog(this.config.skills);
      if (catalog) {
        systemPrompt += `\n\n${catalog}`;
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
