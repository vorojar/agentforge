import { describe, it, expect } from "vitest";
import type { AgentConfig, LLMMessage, Skill, SkillRegistry } from "@agentforge/types";
import { ContextBuilder } from "../src/context.js";

function makeAgentConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: "agent-1",
    name: "Test Agent",
    description: "A test agent",
    systemPrompt: "You are a helpful assistant.",
    model: "mock-model",
    temperature: 0.7,
    maxTokens: 1024,
    maxIterations: 5,
    streaming: false,
    thinking: false,
    tools: [],
    skills: [],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

class MockSkillRegistry implements SkillRegistry {
  private skills: Skill[] = [];

  register(skill: Skill): void {
    this.skills.push(skill);
  }

  get(name: string): Skill | undefined {
    return this.skills.find((s) => s.name === name);
  }

  list(): Skill[] {
    return this.skills;
  }

  match(query: string): { skill: Skill; score: number } | null {
    if (query.includes("weather")) {
      const skill = this.skills.find((s) => s.name === "weather-skill");
      if (skill) return { skill, score: 0.9 };
    }
    return null;
  }
}

describe("ContextBuilder", () => {
  it("builds system prompt from agent config", () => {
    const config = makeAgentConfig({
      systemPrompt: "You are a coding assistant.",
    });
    const builder = new ContextBuilder(config);
    const { systemPrompt, messages } = builder.build([], "hello");

    expect(systemPrompt).toBe("You are a coding assistant.");
    expect(messages).toEqual([]);
  });

  it("includes skill content when matched", () => {
    const skillRegistry = new MockSkillRegistry();
    skillRegistry.register({
      id: "skill-1",
      name: "weather-skill",
      description: "Provides weather info",
      content: "Use the weather API to get forecasts.",
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const config = makeAgentConfig({ skills: ["weather-skill"] });
    const builder = new ContextBuilder(config, skillRegistry);
    const { systemPrompt } = builder.build([], "What is the weather today?");

    expect(systemPrompt).toContain("You are a helpful assistant.");
    expect(systemPrompt).toContain("skill-1");
    expect(systemPrompt).toContain("Provides weather info");
    expect(systemPrompt).toContain("get_skill_content");
  });

  it("truncates old messages when over token budget", () => {
    const config = makeAgentConfig({});
    const builder = new ContextBuilder(config);

    const longMessage = "x".repeat(1000); // ~250 tokens each
    // Need >10 messages so minKeep doesn't prevent truncation
    const messages: LLMMessage[] = [];
    for (let i = 0; i < 14; i++) {
      messages.push({ role: i % 2 === 0 ? "user" : "assistant", content: longMessage });
    }

    // Pass a small maxHistoryTokens to force truncation
    const { messages: result } = builder.build(messages, "new question", 500);

    // Should have fewer messages than the original 14
    expect(result.length).toBeLessThan(14);
    // Should keep the most recent messages
    expect(result[result.length - 1]).toEqual({
      role: "assistant",
      content: longMessage,
    });
  });
});
