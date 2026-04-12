import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMMessage,
  ContentBlock,
  ToolDefinition,
} from "@agentforge/types";

type AnthropicMessageParam = Anthropic.MessageParam;
type AnthropicContentBlock =
  | Anthropic.TextBlockParam
  | Anthropic.ImageBlockParam
  | Anthropic.ToolUseBlockParam
  | Anthropic.ToolResultBlockParam;
type AnthropicTool = Anthropic.Tool;

function toAnthropicMessages(messages: LLMMessage[]): AnthropicMessageParam[] {
  return messages.map((msg) => {
    if (typeof msg.content === "string") {
      return { role: msg.role, content: msg.content };
    }

    const blocks: AnthropicContentBlock[] = msg.content.map((block) => {
      switch (block.type) {
        case "text":
          return { type: "text" as const, text: block.text };
        case "image":
          if (block.source.type === "base64") {
            return {
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: block.source.mediaType as Anthropic.Base64ImageSource["media_type"],
                data: block.source.data,
              },
            };
          } else {
            return {
              type: "image" as const,
              source: {
                type: "url" as const,
                url: block.source.url,
              },
            };
          }
        case "tool_use":
          return {
            type: "tool_use" as const,
            id: block.id,
            name: block.name,
            input: block.input,
          };
        case "tool_result":
          return {
            type: "tool_result" as const,
            tool_use_id: block.toolUseId,
            content: block.content,
            is_error: block.isError,
          };
      }
    });

    return { role: msg.role, content: blocks };
  });
}

function toAnthropicTools(tools: ToolDefinition[]): AnthropicTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object" as const,
      properties: tool.parameters.properties,
      required: tool.parameters.required,
    },
  }));
}

function fromAnthropicContent(
  content: Anthropic.ContentBlock[]
): ContentBlock[] {
  const result: ContentBlock[] = [];
  for (const block of content) {
    if (block.type === "text") {
      result.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use") {
      result.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }
  return result;
}

function mapStopReason(
  reason: string | null
): "end_turn" | "tool_use" | "max_tokens" {
  switch (reason) {
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    default:
      return "end_turn";
  }
}

export class ClaudeProvider implements LLMProvider {
  readonly name = "claude";
  private client: Anthropic;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: 60_000,
    });
  }

  private buildParams(request: LLMRequest): Anthropic.MessageCreateParamsNonStreaming {
    // System prompt as cached block for prompt caching
    const systemBlocks: Anthropic.TextBlockParam[] = [
      { type: "text", text: request.systemPrompt, cache_control: { type: "ephemeral" } },
    ];

    // Tools with cache_control on last tool for prompt caching
    let tools: AnthropicTool[] | undefined;
    if (request.tools && request.tools.length > 0) {
      tools = toAnthropicTools(request.tools);
      // Mark last tool with cache_control so entire tool list is cached
      (tools[tools.length - 1] as AnthropicTool & { cache_control?: unknown }).cache_control = { type: "ephemeral" };
    }

    const base: Anthropic.MessageCreateParamsNonStreaming = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      system: systemBlocks,
      messages: toAnthropicMessages(request.messages),
      tools,
    };

    if (request.thinking) {
      const budgetTokens = base.max_tokens;
      base.max_tokens = Math.max(budgetTokens * 4, 16000);
      (base as unknown as Record<string, unknown>).thinking = { type: "enabled", budget_tokens: budgetTokens };
    } else {
      base.temperature = request.temperature;
    }

    return base;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const params = this.buildParams(request);
    const response = await this.client.messages.create(params);

    let thinking: string | undefined;
    for (const block of response.content) {
      if ((block as { type: string; thinking?: string }).type === "thinking") {
        const text = (block as { type: string; thinking?: string }).thinking;
        if (text) thinking = (thinking ?? "") + text;
      }
    }

    const usage = response.usage as unknown as Record<string, number>;
    return {
      content: fromAnthropicContent(response.content),
      thinking,
      stopReason: mapStopReason(response.stop_reason),
      model: response.model,
      usage: {
        tokensIn: usage.input_tokens,
        tokensOut: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        cacheCreationTokens: usage.cache_creation_input_tokens || 0,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const params = this.buildParams(request);
    const stream = this.client.messages.stream(params);

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        } else if (event.delta.type === "thinking_delta") {
          yield { type: "thinking", text: (event.delta as { type: string; thinking: string }).thinking };
        }
      }
    }

    const finalMessage = await stream.finalMessage();

    for (const block of finalMessage.content) {
      if (block.type === "tool_use") {
        yield {
          type: "tool_use_start",
          toolUse: {
            id: block.id,
            name: block.name,
            input: JSON.stringify(block.input),
          },
        };
        yield { type: "tool_use_end" };
      }
    }

    const streamUsage = finalMessage.usage as unknown as Record<string, number>;
    yield {
      type: "done",
      usage: {
        tokensIn: streamUsage.input_tokens,
        tokensOut: streamUsage.output_tokens,
        cacheReadTokens: streamUsage.cache_read_input_tokens || 0,
        cacheCreationTokens: streamUsage.cache_creation_input_tokens || 0,
      },
      stopReason: mapStopReason(finalMessage.stop_reason),
    };
  }
}
