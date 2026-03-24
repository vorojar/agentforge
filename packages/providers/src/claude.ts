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
    });
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.systemPrompt,
      messages: toAnthropicMessages(request.messages),
      tools: request.tools ? toAnthropicTools(request.tools) : undefined,
      temperature: request.temperature,
    });

    return {
      content: fromAnthropicContent(response.content),
      stopReason: mapStopReason(response.stop_reason),
      model: response.model,
      usage: {
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const stream = this.client.messages.stream({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.systemPrompt,
      messages: toAnthropicMessages(request.messages),
      tools: request.tools ? toAnthropicTools(request.tools) : undefined,
      temperature: request.temperature,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "text", text: event.delta.text };
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

    yield {
      type: "done",
      usage: {
        tokensIn: finalMessage.usage.input_tokens,
        tokensOut: finalMessage.usage.output_tokens,
      },
      stopReason: mapStopReason(finalMessage.stop_reason),
    };
  }
}
