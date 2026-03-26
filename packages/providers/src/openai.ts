import OpenAI from "openai";
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMMessage,
  ContentBlock,
  ToolDefinition,
} from "@agentforge/types";

type ChatCompletionMessageParam =
  OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool;

function toOpenAIMessages(
  systemPrompt: string,
  messages: LLMMessage[]
): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      if (msg.role === "assistant") {
        result.push({ role: "assistant", content: msg.content });
      } else {
        result.push({ role: "user", content: msg.content });
      }
      continue;
    }

    // Handle ContentBlock arrays
    if (msg.role === "assistant") {
      // Collect text and tool_calls from content blocks
      let textContent = "";
      const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] =
        [];

      for (const block of msg.content) {
        if (block.type === "text") {
          textContent += block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
        }
      }

      result.push({
        role: "assistant",
        content: textContent || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      });
    } else {
      // user role - may contain tool_result blocks
      for (const block of msg.content) {
        if (block.type === "text") {
          result.push({ role: "user", content: block.text });
        } else if (block.type === "tool_result") {
          result.push({
            role: "tool",
            tool_call_id: block.toolUseId,
            content: block.content,
          });
        }
      }
    }
  }

  return result;
}

function toOpenAITools(tools: ToolDefinition[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    },
  }));
}

function mapFinishReason(
  reason: string | null
): "end_turn" | "tool_use" | "max_tokens" {
  switch (reason) {
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    default:
      return "end_turn";
  }
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: 60_000,
    });
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      messages: toOpenAIMessages(request.systemPrompt, request.messages),
      tools: request.tools ? toOpenAITools(request.tools) : undefined,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
    });

    const choice = response.choices[0];
    const content: ContentBlock[] = [];

    if (choice.message.content) {
      content.push({ type: "text", text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments),
        });
      }
    }

    const usageAny = response.usage as unknown as Record<string, Record<string, number>> | undefined;
    const cacheReadTokens = usageAny?.prompt_tokens_details?.cached_tokens || undefined;

    return {
      content,
      stopReason: mapFinishReason(choice.finish_reason),
      model: response.model,
      usage: {
        tokensIn: response.usage?.prompt_tokens ?? 0,
        tokensOut: response.usage?.completion_tokens ?? 0,
        cacheReadTokens,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: request.model,
      messages: toOpenAIMessages(request.systemPrompt, request.messages),
      tools: request.tools ? toOpenAITools(request.tools) : undefined,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
    });

    const toolCalls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      finishReason = chunk.choices[0]?.finish_reason ?? finishReason;

      if (delta?.content) {
        yield { type: "text", text: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCalls.get(tc.index);
          if (!existing) {
            toolCalls.set(tc.index, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              arguments: tc.function?.arguments ?? "",
            });
          } else {
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          }
        }
      }
    }

    for (const [, tc] of toolCalls) {
      yield {
        type: "tool_use_start",
        toolUse: { id: tc.id, name: tc.name, input: tc.arguments },
      };
      yield { type: "tool_use_end" };
    }

    yield {
      type: "done",
      stopReason: mapFinishReason(finishReason),
    };
  }
}
