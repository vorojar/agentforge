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
  ProviderCandidate,
  ProviderResolveOptions,
  ModelTrace,
} from "@agentforge/types";
import { ToolExecutor } from "@agentforge/tools";
import { ContextBuilder } from "./context.js";

export interface ProviderResolver {
  resolve(candidates: ProviderCandidate[], agentKey?: string, options?: ProviderResolveOptions): LLMProvider;
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
  thinking?: string;
  systemPrompt: string;
  sessionId: string;
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    result: string;
  }>;
  usage: { tokensIn: number; tokensOut: number; cacheReadTokens?: number; durationMs: number };
}

export type StreamEvent =
  | { type: "system_prompt"; data: string }
  | { type: "text"; data: string }
  | { type: "thinking"; data: string }
  | { type: "tool_call"; data: { name: string; input: Record<string, unknown> } }
  | { type: "tool_result"; data: { name: string; result: string } }
  | { type: "done"; data: { reply: string; sessionId: string; usage: { tokensIn: number; tokensOut: number; cacheReadTokens?: number; durationMs: number } } };

function generateId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function compactContentForPersistence(content: string | ContentBlock[]): string | ContentBlock[] {
  if (typeof content === "string") return content;
  const compacted: ContentBlock[] = [];
  let omittedImageCount = 0;
  let omittedBytes = 0;
  for (const block of content) {
    if (block.type === "image" && block.source.type === "base64") {
      omittedImageCount += 1;
      omittedBytes += block.source.data.length;
      compacted.push({
        type: "text",
        text: `[图片已发送给模型，但 base64 内容不写入历史记录：${block.source.mediaType}]`,
      });
    } else {
      compacted.push(block);
    }
  }
  if (omittedImageCount > 0) {
    compacted.push({
      type: "text",
      text: `[已省略 ${omittedImageCount} 张图片的历史存储内容，约 ${(omittedBytes / 1024 / 1024).toFixed(1)}MB base64]`,
    });
  }
  return compacted;
}

function getToolDefinitions(
  registry: ToolRegistry,
  toolNames: string[],
  hasKnowledge?: boolean,
  hasSkills?: boolean
): ToolDefinition[] {
  if (toolNames.length === 0 && !hasKnowledge && !hasSkills) return [];
  const names = [...toolNames];
  if (hasKnowledge && !names.includes("search_knowledge") && registry.get("search_knowledge")) {
    names.push("search_knowledge");
  }
  if (hasSkills && !names.includes("get_skill_content") && registry.get("get_skill_content")) {
    names.push("get_skill_content");
  }
  if (names.length === 0) return [];
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
      return this.config.providerRegistry.resolve(
        this.buildProviderCandidates(agentConfig),
        agentConfig.id,
        { fallbackCooldownMs: (agentConfig.fallbackCooldownSeconds ?? 900) * 1000 },
      );
    }
    if (this.config.provider) return this.config.provider;
    throw new Error("No LLM provider configured");
  }

  private buildProviderCandidates(agentConfig: AgentConfig): ProviderCandidate[] {
    const candidates: ProviderCandidate[] = [
      { providerId: agentConfig.providerId, model: agentConfig.model },
      ...(agentConfig.fallbackModels ?? []),
    ];
    const result: ProviderCandidate[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const providerId = candidate.providerId?.trim();
      const model = candidate.model?.trim();
      if (!model) continue;
      const key = `${providerId ?? ""}:${model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ providerId: providerId || undefined, model });
    }
    return result;
  }

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
    const sid = sessionId ?? await this.createSession(agentConfig);
    const history = await this.loadHistory(sid);
    const contextBuilder = new ContextBuilder(
      agentConfig,
      this.config.skillRegistry
    );
    const hasKnowledge = await this.agentHasKnowledge(agentConfig.id);
    const hasSkills = agentConfig.skills.length > 0;
    const toolDefs = getToolDefinitions(
      this.config.toolRegistry,
      agentConfig.tools,
      hasKnowledge,
      hasSkills
    );

    const userContent = this.buildUserContent(message, images);
    history.push({ role: "user", content: userContent });
    await this.persistMessage(sid, agentConfig.id, "user", userContent);

    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCacheRead = 0;
    const toolCalls: AgentRunResult["toolCalls"] = [];
    let accumulatedText = "";
    let accumulatedThinking = "";
    let finalSystemPrompt = "";
    let lastModel = agentConfig.model;

    for (let i = 0; i < agentConfig.maxIterations; i++) {
      const { systemPrompt, messages } = contextBuilder.build(
        history
      );
      if (i === 0) finalSystemPrompt = systemPrompt;

      const provider = this.resolveProvider(agentConfig);
      const response: LLMResponse = await provider.chat({
        model: agentConfig.model,
        systemPrompt,
        messages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        maxTokens: agentConfig.maxTokens,
        temperature: agentConfig.temperature,
        thinking: agentConfig.thinking,
      });

      const responseModel = response.model || agentConfig.model;
      lastModel = responseModel;
      totalTokensIn += response.usage.tokensIn;
      totalTokensOut += response.usage.tokensOut;
      totalCacheRead += response.usage.cacheReadTokens ?? 0;
      if (response.thinking) accumulatedThinking += response.thinking;

      if (response.stopReason === "end_turn" || response.stopReason === "max_tokens") {
        const text = extractText(response.content);
        accumulatedText += text;

        history.push({ role: "assistant", content: response.content, thinking: response.thinking });
        await this.persistMessage(
          sid, agentConfig.id, "assistant", response.content,
          response.usage.tokensIn, response.usage.tokensOut, response.thinking,
          response.usage.cacheReadTokens, responseModel, response.modelTrace
        );

        break;
      }

      if (response.stopReason === "tool_use") {
        history.push({ role: "assistant", content: response.content, thinking: response.thinking });
        await this.persistMessage(
          sid, agentConfig.id, "assistant", response.content,
          response.usage.tokensIn, response.usage.tokensOut, response.thinking,
          response.usage.cacheReadTokens, responseModel, response.modelTrace
        );

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

        history.push({ role: "user", content: resultBlocks });
        await this.persistMessage(sid, agentConfig.id, "user", resultBlocks);

        accumulatedText += extractText(response.content);
        continue;
      }
    }

    const durationMs = Date.now() - startTime;

    if (this.config.db) {
      await this.config.db.logUsage({
        agentId: agentConfig.id,
        sessionId: sid,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        model: lastModel,
        durationMs,
      });
    }

    return {
      reply: accumulatedText,
      thinking: accumulatedThinking || undefined,
      systemPrompt: finalSystemPrompt,
      sessionId: sid,
      toolCalls,
      usage: {
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        cacheReadTokens: totalCacheRead || undefined,
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
    const sid = sessionId ?? await this.createSession(agentConfig);
    const history = await this.loadHistory(sid);
    const contextBuilder = new ContextBuilder(
      agentConfig,
      this.config.skillRegistry
    );
    const hasKnowledge = await this.agentHasKnowledge(agentConfig.id);
    const hasSkills = agentConfig.skills.length > 0;
    const toolDefs = getToolDefinitions(
      this.config.toolRegistry,
      agentConfig.tools,
      hasKnowledge,
      hasSkills
    );

    const userContent = this.buildUserContent(message, images);
    history.push({ role: "user", content: userContent });
    await this.persistMessage(sid, agentConfig.id, "user", userContent);

    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCacheRead = 0;
    let accumulatedText = "";
    const toolCalls: AgentRunResult["toolCalls"] = [];
    let systemPromptEmitted = false;
    let lastModel = agentConfig.model;

    for (let i = 0; i < agentConfig.maxIterations; i++) {
      const { systemPrompt, messages } = contextBuilder.build(
        history
      );

      if (!systemPromptEmitted) {
        yield { type: "system_prompt", data: systemPrompt };
        systemPromptEmitted = true;
      }

      const provider = this.resolveProvider(agentConfig);
      const stream = provider.stream({
        model: agentConfig.model,
        systemPrompt,
        messages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        maxTokens: agentConfig.maxTokens,
        temperature: agentConfig.temperature,
        thinking: agentConfig.thinking,
      });

      let stopReason: string | undefined;
      const contentBlocks: ContentBlock[] = [];
      let currentToolUse: { id: string; name: string; inputJson: string } | null = null;
      let iterationThinking = "";
      let iterationTokensIn = 0;
      let iterationTokensOut = 0;
      let iterationCacheRead = 0;
      let iterationModel = agentConfig.model;
      let iterationModelTrace: ModelTrace | undefined;

      for await (const chunk of stream) {
        if (chunk.type === "thinking" && chunk.text) {
          iterationThinking += chunk.text;
          yield { type: "thinking", data: chunk.text };
        } else if (chunk.type === "text" && chunk.text) {
          accumulatedText += chunk.text;
          contentBlocks.push({ type: "text", text: chunk.text });
          yield { type: "text", data: chunk.text };
        } else if (chunk.type === "tool_use_start" && chunk.toolUse) {
          currentToolUse = {
            id: chunk.toolUse.id,
            name: chunk.toolUse.name,
            inputJson: chunk.toolUse.input ?? "",
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
            iterationTokensIn = chunk.usage.tokensIn;
            iterationTokensOut = chunk.usage.tokensOut;
            iterationCacheRead = chunk.usage.cacheReadTokens ?? 0;
            totalTokensIn += iterationTokensIn;
            totalTokensOut += iterationTokensOut;
            totalCacheRead += iterationCacheRead;
          }
          iterationModel = chunk.model ?? agentConfig.model;
          iterationModelTrace = chunk.modelTrace;
          lastModel = iterationModel;
        }
      }

      const mergedBlocks: ContentBlock[] = [];
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
        history.push({ role: "assistant", content: mergedBlocks, thinking: iterationThinking || undefined });
        await this.persistMessage(sid, agentConfig.id, "assistant", mergedBlocks, iterationTokensIn || undefined, iterationTokensOut || undefined, iterationThinking || undefined, iterationCacheRead || undefined, iterationModel, iterationModelTrace);
        break;
      }

      if (stopReason === "tool_use") {
        history.push({ role: "assistant", content: mergedBlocks, thinking: iterationThinking || undefined });
        await this.persistMessage(sid, agentConfig.id, "assistant", mergedBlocks, iterationTokensIn || undefined, iterationTokensOut || undefined, iterationThinking || undefined, iterationCacheRead || undefined, iterationModel, iterationModelTrace);

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
        await this.persistMessage(sid, agentConfig.id, "user", resultBlocks);
        continue;
      }
    }

    const durationMs = Date.now() - startTime;

    if (this.config.db) {
      await this.config.db.logUsage({
        agentId: agentConfig.id,
        sessionId: sid,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        model: lastModel,
        durationMs,
      });
    }

    yield {
      type: "done",
      data: {
        reply: accumulatedText,
        sessionId: sid,
        usage: { tokensIn: totalTokensIn, tokensOut: totalTokensOut, cacheReadTokens: totalCacheRead || undefined, durationMs },
      },
    };
  }

  private async createSession(agentConfig: AgentConfig): Promise<string> {
    if (this.config.db) {
      const session = await this.config.db.createSession(agentConfig.id);
      return session.id;
    }
    return generateId();
  }

  private async loadHistory(sessionId: string): Promise<LLMMessage[]> {
    if (!this.config.db) return [];
    const messages = await this.config.db.getMessages(sessionId);
    return messages.map((m) => ({
      role: m.role === "tool" ? ("user" as const) : (m.role as "user" | "assistant"),
      content: m.content,
      thinking: m.thinking,
    }));
  }

  private async agentHasKnowledge(agentId: string): Promise<boolean> {
    if (!this.config.db) return false;
    const kbIds = await this.config.db.getAgentKnowledge(agentId);
    return kbIds.length > 0;
  }

  private async persistMessage(
    sessionId: string,
    _agentId: string,
    role: "user" | "assistant",
    content: string | ContentBlock[],
    tokensIn?: number,
    tokensOut?: number,
    thinking?: string,
    cacheReadTokens?: number,
    model?: string,
    modelTrace?: ModelTrace
  ): Promise<void> {
    if (!this.config.db) return;
    await this.config.db.addMessage({
      sessionId,
      role,
      content: compactContentForPersistence(content),
      thinking,
      tokensIn,
      tokensOut,
      cacheReadTokens,
      model,
      modelTrace,
    });
  }
}
