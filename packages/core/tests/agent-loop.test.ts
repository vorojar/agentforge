import { describe, it, expect } from "vitest";
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  Tool,
  AgentConfig,
} from "@agentforge/types";
import { ToolRegistryImpl } from "@agentforge/tools";
import { AgentLoop } from "../src/agent-loop.js";

class MockProvider implements LLMProvider {
  name = "mock";
  private responses: LLMResponse[];
  private callIndex = 0;

  constructor(responses: LLMResponse[]) {
    this.responses = responses;
  }

  async chat(_request: LLMRequest): Promise<LLMResponse> {
    return this.responses[this.callIndex++];
  }

  async *stream(_request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const response = this.responses[this.callIndex++];
    for (const block of response.content) {
      if (block.type === "text") {
        yield { type: "text", text: block.text };
      }
    }
    yield {
      type: "done",
      usage: response.usage,
      stopReason: response.stopReason,
    };
  }
}

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
    tools: [],
    skills: [],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const echoTool: Tool = {
  name: "echo",
  description: "Echoes the input",
  parameters: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  },
  async execute(input) {
    return { content: `Echo: ${input.message}` };
  },
};

describe("AgentLoop", () => {
  it("handles simple text response without tools", async () => {
    const provider = new MockProvider([
      {
        content: [{ type: "text", text: "Hello! How can I help?" }],
        stopReason: "end_turn",
        model: "mock-model",
        usage: { tokensIn: 10, tokensOut: 8 },
      },
    ]);

    const registry = new ToolRegistryImpl();
    const loop = new AgentLoop({ provider, toolRegistry: registry });
    const result = await loop.run(makeAgentConfig(), "Hi there");

    expect(result.reply).toBe("Hello! How can I help?");
    expect(result.toolCalls).toHaveLength(0);
    expect(result.usage.tokensIn).toBe(10);
    expect(result.usage.tokensOut).toBe(8);
    expect(result.sessionId).toBeTruthy();
  });

  it("handles tool call then final text response", async () => {
    const provider = new MockProvider([
      {
        content: [
          { type: "text", text: "Let me echo that. " },
          {
            type: "tool_use",
            id: "tool-1",
            name: "echo",
            input: { message: "hello" },
          },
        ],
        stopReason: "tool_use",
        model: "mock-model",
        usage: { tokensIn: 15, tokensOut: 12 },
      },
      {
        content: [{ type: "text", text: 'The echo returned: "Echo: hello"' }],
        stopReason: "end_turn",
        model: "mock-model",
        usage: { tokensIn: 20, tokensOut: 10 },
      },
    ]);

    const registry = new ToolRegistryImpl();
    registry.register(echoTool);

    const loop = new AgentLoop({ provider, toolRegistry: registry });
    const result = await loop.run(
      makeAgentConfig({ tools: ["echo"] }),
      "Echo hello"
    );

    expect(result.reply).toBe(
      'Let me echo that. The echo returned: "Echo: hello"'
    );
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("echo");
    expect(result.toolCalls[0].result).toBe("Echo: hello");
    expect(result.usage.tokensIn).toBe(35);
    expect(result.usage.tokensOut).toBe(22);
  });

  it("stops at maxIterations when provider keeps returning tool_use", async () => {
    const toolUseResponse: LLMResponse = {
      content: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "echo",
          input: { message: "loop" },
        },
      ],
      stopReason: "tool_use",
      model: "mock-model",
      usage: { tokensIn: 5, tokensOut: 5 },
    };

    // Provide enough responses for maxIterations
    const provider = new MockProvider([
      toolUseResponse,
      toolUseResponse,
      toolUseResponse,
    ]);

    const registry = new ToolRegistryImpl();
    registry.register(echoTool);

    const loop = new AgentLoop({ provider, toolRegistry: registry });
    const result = await loop.run(
      makeAgentConfig({ tools: ["echo"], maxIterations: 3 }),
      "Keep going"
    );

    // Should have called tool 3 times (once per iteration)
    expect(result.toolCalls).toHaveLength(3);
    expect(result.usage.tokensIn).toBe(15);
  });

  it("yields text chunks in streaming mode", async () => {
    const provider = new MockProvider([
      {
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world!" },
        ],
        stopReason: "end_turn",
        model: "mock-model",
        usage: { tokensIn: 5, tokensOut: 4 },
      },
    ]);

    const registry = new ToolRegistryImpl();
    const loop = new AgentLoop({ provider, toolRegistry: registry });

    const events: Array<{ type: string; data: unknown }> = [];
    for await (const event of loop.runStream(makeAgentConfig(), "Hi")) {
      events.push(event);
    }

    const textEvents = events.filter((e) => e.type === "text");
    expect(textEvents).toHaveLength(2);
    expect(textEvents[0].data).toBe("Hello ");
    expect(textEvents[1].data).toBe("world!");

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    expect((doneEvent!.data as { reply: string }).reply).toBe("Hello world!");
  });
});
