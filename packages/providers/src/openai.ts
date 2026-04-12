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

const CONTENT_TYPE_MAP: Record<string, string> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

/**
 * 下载图片 URL 并转换为 base64 data URI。
 * 部分 OpenAI 兼容 API（如 kie.ai）会根据 URL 后缀推断文件格式，
 * 对于无标准扩展名的 URL 会直接拒绝。统一转 base64 可避免此类兼容性问题。
 */
async function imageUrlToDataUri(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const mediaType = CONTENT_TYPE_MAP[contentType.split(";")[0].trim().toLowerCase()] ?? "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${mediaType};base64,${buffer.toString("base64")}`;
}

async function toOpenAIMessages(
  systemPrompt: string,
  messages: LLMMessage[]
): Promise<ChatCompletionMessageParam[]> {
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
      // user role - may contain text, image, tool_result blocks
      const userParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
      const toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];

      for (const block of msg.content) {
        if (block.type === "text") {
          userParts.push({ type: "text", text: block.text });
        } else if (block.type === "image") {
          if (block.source.type === "base64") {
            userParts.push({
              type: "image_url",
              image_url: { url: `data:${block.source.mediaType};base64,${block.source.data}` },
            });
          } else {
            const dataUri = await imageUrlToDataUri(block.source.url);
            userParts.push({
              type: "image_url",
              image_url: { url: dataUri },
            });
          }
        } else if (block.type === "tool_result") {
          toolResults.push({
            role: "tool",
            tool_call_id: block.toolUseId,
            content: block.content,
          });
        }
      }

      if (userParts.length > 0) {
        result.push({ role: "user", content: userParts });
      }
      for (const tr of toolResults) {
        result.push(tr);
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

/**
 * 某些 OpenAI 兼容 API（如 kie.ai）响应不带 Content-Type: application/json，
 * 导致 OpenAI SDK 返回原始字符串而非解析后的对象。此函数做兜底 JSON 解析。
 */
function ensureParsed<T>(value: T | string): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value;
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

  private buildThinkingParam(thinking?: boolean): Record<string, unknown> {
    if (thinking === true) return { thinking: { type: "enabled" } };
    if (thinking === false) return { thinking: { type: "disabled" } };
    return {};
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const params: Record<string, unknown> = {
      model: request.model,
      messages: await toOpenAIMessages(request.systemPrompt, request.messages),
      tools: request.tools ? toOpenAITools(request.tools) : undefined,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      ...this.buildThinkingParam(request.thinking),
    };
    const rawResponse = await this.client.chat.completions.create(
      params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    );
    const response = ensureParsed(rawResponse);

    const responseAny = response as unknown as Record<string, unknown>;
    if (!response.choices?.length) {
      const msg = (responseAny.msg ?? responseAny.message ?? responseAny.error ?? "Unknown error") as string;
      throw new Error(`LLM API error: ${msg}`);
    }

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

    let thinking: string | undefined;
    if (request.thinking) {
      const msgAny = choice.message as unknown as Record<string, unknown>;
      thinking = (msgAny.reasoning_content as string) || undefined;
    }

    const usageAny = response.usage as unknown as Record<string, Record<string, number>> | undefined;
    const cacheReadTokens = usageAny?.prompt_tokens_details?.cached_tokens || undefined;

    return {
      content,
      thinking,
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
    const params: Record<string, unknown> = {
      model: request.model,
      messages: await toOpenAIMessages(request.systemPrompt, request.messages),
      tools: request.tools ? toOpenAITools(request.tools) : undefined,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
      stream_options: { include_usage: true },
      ...this.buildThinkingParam(request.thinking),
    };
    const stream = await this.client.chat.completions.create(
      params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
    );

    const toolCalls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let finishReason: string | null = null;
    let usageTokensIn = 0;
    let usageTokensOut = 0;
    let usageCacheRead: number | undefined;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;

      if (request.thinking && delta) {
        const deltaAny = delta as Record<string, unknown> | undefined;
        if (deltaAny?.reasoning_content) {
          yield { type: "thinking", text: deltaAny.reasoning_content as string };
        }
      }

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

      if (chunk.usage) {
        usageTokensIn = chunk.usage.prompt_tokens ?? 0;
        usageTokensOut = chunk.usage.completion_tokens ?? 0;
        const usageAny = chunk.usage as unknown as Record<string, Record<string, number>> | undefined;
        usageCacheRead = usageAny?.prompt_tokens_details?.cached_tokens || undefined;
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
      usage: { tokensIn: usageTokensIn, tokensOut: usageTokensOut, cacheReadTokens: usageCacheRead },
    };
  }
}
