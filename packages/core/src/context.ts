import type { AgentConfig, LLMMessage, Skill, SkillRegistry } from "@agentforge/types";
import { estimateTokens, estimateMessagesTokens } from "./token-utils.js";

/** L1 compression: minify JSON, collapse whitespace */
function compactText(text: string): string {
  // Try JSON minification first (many tool results are pretty-printed JSON)
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(trimmed));
    } catch { /* not valid JSON, fall through */ }
  }
  // Collapse runs of whitespace/newlines to single space
  return text.replace(/\s{2,}/g, " ").trim();
}

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

    // --- Context compression (free, no LLM cost) ---
    // L1: Minify JSON + collapse whitespace in tool_result content
    // L2: Truncate old tool_use input params + old tool_result content

    const recentKeep = 3; // keep last N tool interactions intact
    let toolResultCount = 0;
    let toolUseCount = 0;

    // Backward pass: compress tool blocks, keeping recent ones intact
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (typeof msg.content === "string") continue;
      const blocks = msg.content;
      let mutated = false;

      const ensureMutable = () => {
        if (!mutated) {
          messages[i] = { ...msg, content: [...blocks] };
          mutated = true;
        }
      };

      for (let j = blocks.length - 1; j >= 0; j--) {
        const block = blocks[j];

        if (block.type === "tool_result") {
          toolResultCount++;
          const isOld = toolResultCount > recentKeep;

          if (isOld && block.content.length > 200) {
            // L2: Hard truncate old tool results
            ensureMutable();
            (messages[i].content as typeof blocks)[j] = {
              ...block,
              content: block.content.slice(0, 200) + "... [truncated]",
            };
          } else if (block.content.length > 500) {
            // L1: Minify JSON / collapse whitespace for medium-size results
            const compacted = compactText(block.content);
            if (compacted.length < block.content.length * 0.85) {
              ensureMutable();
              (messages[i].content as typeof blocks)[j] = { ...block, content: compacted };
            }
          }
        }

        if (block.type === "tool_use") {
          toolUseCount++;
          if (toolUseCount > recentKeep) {
            // L2: Strip old tool_use input params (keep tool name for context)
            const inputStr = JSON.stringify(block.input);
            if (inputStr.length > 100) {
              ensureMutable();
              (messages[i].content as typeof blocks)[j] = { ...block, input: { _compressed: true } };
            }
          }
        }
      }
    }

    return { systemPrompt, messages };
  }
}
