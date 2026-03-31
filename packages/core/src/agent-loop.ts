import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMStreamChunk,
  ToolRegistry,
  ToolDefinition,
  ToolResultBlock,
  ToolUseBlock,
  ContentBlock,
  ImageBlock,
  SkillRegistry,
  DatabaseAdapter,
  AgentConfig,
} from "@agentforge/types";
import { ToolExecutor } from "@agentforge/tools";
import { ContextBuilder } from "./context.js";

/** Resolves an LLMProvider by provider ID (or returns default) */
export interface ProviderResolver {
  resolve(providerId?: string): LLMProvider;
}

export interface AgentLoopConfig {
  provider?: LLMProvider;
  providerRegistry?: ProviderResolver;
  toolRegistry: ToolRegistry;
  skillRegistry?: SkillRegistry;
  db?: DatabaseAdapter;
}

export interface AgentRunResult {
  reply: string;
  sessionId: string;
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    result: string;
  }>;
  usage: { tokensIn: number; tokensOut: number; durationMs: number };
}

export type StreamEvent =
  | { type: "text"; data: string }
  | { type: "thinking"; data: string }
  | { type: "tool_call"; data: { name: string; input: Record<string, unknown> } }
  | { type: "tool_result"; data: { name: string; result: string } }
  | { type: "done"; data: { reply: string; sessionId: string; usage: { tokensIn: number; tokensOut: number; durationMs: number } } };

function generateId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Internal tools that are always available (not shown in whitelist UI) */
const AUTO_INJECT_TOOLS = ["search_knowledge", "read_skill_file"];

function getToolDefinitions(
  registry: ToolRegistry,
  toolNames: string[]
): ToolDefinition[] {
  if (toolNames.length === 0) return [];
  // Include explicitly whitelisted tools + auto-injected tools
  const names = [...toolNames];
  for (const name of AUTO_INJECT_TOOLS) {
    if (!names.includes(name) && registry.get(name)) names.push(name);
  }
  const tools = registry.getByNames(names);
  return tools.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
}

export class AgentLoop {
  private executor: ToolExecutor;

  constructor(private config: AgentLoopConfig) {
    this.executor = new ToolExecutor(config.toolRegistry);
  }

  private resolveProvider(agentConfig: AgentConfig): LLMProvider {
    if (this.config.providerRegistry) {
      return this.config.providerRegistry.resolve(agentConfig.providerId);
    }
    if (this.config.provider) return this.config.provider;
    throw new Error("No LLM provider configured");
  }

  /** 将文本和可选的图片块组合成 user 消息内容 */
  private buildUserContent(message: string, images?: ImageBlock[]): string | ContentBlock[] {
    if (!images || images.length === 0) return message;
    const blocks: ContentBlock[] = [];
    for (const img of images) blocks.push(img);
    if (message) blocks.push({ type: "text", text: message });
    return blocks;
  }

  async run(
    agentConfig: AgentConfig,
    message: string,
    sessionId?: string,
    images?: ImageBlock[]
  ): Promise<AgentRunResult> {
    const startTime = Date.now();
    const sid = sessionId ?? this.createSession(agentConfig);
    const history = this.loadHistory(sid);
    const contextBuilder = new ContextBuilder(
      agentConfig,
      this.config.skillRegistry
    );
    const toolDefs = getToolDefinitions(
      this.config.toolRegistry,
      agentConfig.tools
    );

    // Add user message (with optional images)
    const userContent = this.buildUserContent(message, images);
    history.push({ role: "user", content: userContent });
    this.persistMessage(sid, agentConfig.id, "user", userContent);

    let totalTokensIn = 0;
    let totalTokensOut = 0;
    const toolCalls: AgentRunResult["toolCalls"] = [];
    let accumulatedText = "";

    for (let i = 0; i < agentConfig.maxIterations; i++) {
      const { systemPrompt, messages } = contextBuilder.build(
        history,
        i === 0 ? message : undefined
      );

      const provider = this.resolveProvider(agentConfig);
      const response: LLMResponse = await provider.chat({
        model: agentConfig.model,
        systemPrompt,
        messages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        maxTokens: agentConfig.maxTokens,
        temperature: agentConfig.temperature,
      });

      totalTokensIn += response.usage.tokensIn;
      totalTokensOut += response.usage.tokensOut;

      if (response.stopReason === "end_turn" || response.stopReason === "max_tokens") {
        const text = extractText(response.content);
        accumulatedText += text;

        // Persist assistant message
        history.push({ role: "assistant", content: response.content });
        this.persistMessage(
          sid,
          agentConfig.id,
          "assistant",
          response.content,
          response.usage.tokensIn,
          response.usage.tokensOut
        );

        break;
      }

      if (response.stopReason === "tool_use") {
        // Add assistant message with tool_use blocks
        history.push({ role: "assistant", content: response.content });
        this.persistMessage(
          sid,
          agentConfig.id,
          "assistant",
          response.content,
          response.usage.tokensIn,
          response.usage.tokensOut
        );

        // Execute each tool and collect results
        const resultBlocks: ToolResultBlock[] = [];
        for (const block of response.content) {
          if (block.type === "tool_use") {
            const toolResult = await this.executor.execute(
              block.name,
              block.input,
              { agentId: agentConfig.id, sessionId: sid }
            );

            resultBlocks.push({
              type: "tool_result",
              toolUseId: block.id,
              content: toolResult.content,
              isError: toolResult.isError,
            });

            toolCalls.push({
              name: block.name,
              input: block.input,
              result: toolResult.content,
            });
          }
        }

        // Add tool results as user message
        history.push({ role: "user", content: resultBlocks });
        this.persistMessage(sid, agentConfig.id, "user", resultBlocks);

        // Also capture any text from the assistant message with tool calls
        accumulatedText += extractText(response.content);
        continue;
      }

      // Unknown stopReason — persist what we have and break to avoid silent loops
      history.push({ role: "assistant", content: response.content });
      this.persistMessage(sid, agentConfig.id, "assistant", response.content);
      accumulatedText += extractText(response.content);
      break;
    }

    const durationMs = Date.now() - startTime;

    // Log usage
    if (this.config.db) {
      this.config.db.logUsage({
        agentId: agentConfig.id,
        sessionId: sid,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        model: agentConfig.model,
        durationMs,
      });
    }

    return {
      reply: accumulatedText,
      sessionId: sid,
      toolCalls,
      usage: {
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        durationMs,
      },
    };
  }

  async *runStream(
    agentConfig: AgentConfig,
    message: string,
    sessionId?: string,
    images?: ImageBlock[]
  ): AsyncGenerator<StreamEvent> {
    const startTime = Date.now();
    const sid = sessionId ?? this.createSession(agentConfig);
    const history = this.loadHistory(sid);
    const contextBuilder = new ContextBuilder(
      agentConfig,
      this.config.skillRegistry
    );
    const toolDefs = getToolDefinitions(
      this.config.toolRegistry,
      agentConfig.tools
    );

    const userContent = this.buildUserContent(message, images);
    history.push({ role: "user", content: userContent });
    this.persistMessage(sid, agentConfig.id, "user", userContent);

    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let accumulatedText = "";
    const toolCalls: AgentRunResult["toolCalls"] = [];

    for (let i = 0; i < agentConfig.maxIterations; i++) {
      const { systemPrompt, messages } = contextBuilder.build(
        history,
        i === 0 ? message : undefined
      );

      const provider = this.resolveProvider(agentConfig);
      const stream = provider.stream({
        model: agentConfig.model,
        systemPrompt,
        messages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        maxTokens: agentConfig.maxTokens,
        temperature: agentConfig.temperature,
      });

      let stopReason: string | undefined;
      const contentBlocks: ContentBlock[] = [];
      let currentToolUse: { id: string; name: string; inputJson: string } | null = null;
      let thinkingText = "";
      let iterTokensIn = 0;
      let iterTokensOut = 0;

      for await (const chunk of stream) {
        if (chunk.type === "thinking" && chunk.text) {
          thinkingText += chunk.text;
          yield { type: "thinking", data: chunk.text };
        } else if (chunk.type === "text" && chunk.text) {
          accumulatedText += chunk.text;
          contentBlocks.push({ type: "text", text: chunk.text });
          yield { type: "text", data: chunk.text };
        } else if (chunk.type === "tool_use_start" && chunk.toolUse) {
          currentToolUse = {
            id: chunk.toolUse.id,
            name: chunk.toolUse.name,
            inputJson: "",
          };
        } else if (chunk.type === "tool_use_delta" && chunk.toolUse) {
          if (currentToolUse) {
            currentToolUse.inputJson += chunk.toolUse.input;
          }
        } else if (chunk.type === "tool_use_end") {
          if (currentToolUse) {
            const input = currentToolUse.inputJson
              ? (JSON.parse(currentToolUse.inputJson) as Record<string, unknown>)
              : {};
            contentBlocks.push({
              type: "tool_use",
              id: currentToolUse.id,
              name: currentToolUse.name,
              input,
            });
            currentToolUse = null;
          }
        } else if (chunk.type === "done") {
          stopReason = chunk.stopReason;
          if (chunk.usage) {
            iterTokensIn = chunk.usage.tokensIn;
            iterTokensOut = chunk.usage.tokensOut;
            totalTokensIn += iterTokensIn;
            totalTokensOut += iterTokensOut;
          }
        }
      }

      // Merge consecutive text chunks into a single text block for storage
      const mergedBlocks: ContentBlock[] = [];
      if (thinkingText) {
        mergedBlocks.push({ type: "thinking", text: thinkingText });
      }
      let pendingText = "";
      for (const block of contentBlocks) {
        if (block.type === "text") {
          pendingText += block.text ?? "";
        } else {
          if (pendingText) { mergedBlocks.push({ type: "text", text: pendingText }); pendingText = ""; }
          mergedBlocks.push(block);
        }
      }
      if (pendingText) mergedBlocks.push({ type: "text", text: pendingText });

      if (stopReason === "end_turn" || stopReason === "max_tokens") {
        history.push({ role: "assistant", content: mergedBlocks });
        this.persistMessage(sid, agentConfig.id, "assistant", mergedBlocks, iterTokensIn, iterTokensOut);
        break;
      }

      if (stopReason === "tool_use") {
        history.push({ role: "assistant", content: mergedBlocks });
        this.persistMessage(sid, agentConfig.id, "assistant", mergedBlocks, iterTokensIn, iterTokensOut);

        const resultBlocks: ToolResultBlock[] = [];
        for (const block of contentBlocks) {
          if (block.type === "tool_use") {
            yield { type: "tool_call", data: { name: block.name, input: block.input } };

            const toolResult = await this.executor.execute(
              block.name,
              block.input,
              { agentId: agentConfig.id, sessionId: sid }
            );

            resultBlocks.push({
              type: "tool_result",
              toolUseId: block.id,
              content: toolResult.content,
              isError: toolResult.isError,
            });

            toolCalls.push({
              name: block.name,
              input: block.input,
              result: toolResult.content,
            });

            yield { type: "tool_result", data: { name: block.name, result: toolResult.content } };
          }
        }

        history.push({ role: "user", content: resultBlocks });
        this.persistMessage(sid, agentConfig.id, "user", resultBlocks);
        continue;
      }

      // Unknown stopReason — persist and break
      history.push({ role: "assistant", content: mergedBlocks });
      this.persistMessage(sid, agentConfig.id, "assistant", mergedBlocks, iterTokensIn, iterTokensOut);
      break;
    }

    const durationMs = Date.now() - startTime;

    if (this.config.db) {
      this.config.db.logUsage({
        agentId: agentConfig.id,
        sessionId: sid,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        model: agentConfig.model,
        durationMs,
      });
    }

    yield {
      type: "done",
      data: {
        reply: accumulatedText,
        sessionId: sid,
        usage: { tokensIn: totalTokensIn, tokensOut: totalTokensOut, durationMs },
      },
    };
  }

  private createSession(agentConfig: AgentConfig): string {
    if (this.config.db) {
      const session = this.config.db.createSession(agentConfig.id);
      return session.id;
    }
    return generateId();
  }

  private loadHistory(sessionId: string): LLMMessage[] {
    if (!this.config.db) return [];
    const messages = this.config.db.getMessages(sessionId);
    return messages.map((m) => ({
      role: m.role === "tool" ? ("user" as const) : (m.role as "user" | "assistant"),
      content: m.content,
    }));
  }

  private persistMessage(
    sessionId: string,
    _agentId: string,
    role: "user" | "assistant",
    content: string | ContentBlock[],
    tokensIn?: number,
    tokensOut?: number
  ): void {
    if (!this.config.db) return;
    this.config.db.addMessage({
      sessionId,
      role,
      content,
      tokensIn,
      tokensOut,
    });
  }
}
