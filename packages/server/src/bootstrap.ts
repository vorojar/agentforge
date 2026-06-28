/**
 * 应用启动引导
 * 功能：初始化数据库、Provider、工具注册表等核心组件
 * 创建时间：2026-03-31
 * 负责人：王觉贤
 */

import { resolve } from "node:path";
import type { ContentBlock, DatabaseAdapter, LLMMessage, LLMProvider, LLMRequest, ModelCapabilities, ModelTrace, ModelTraceAttempt, ProviderCandidate, ProviderResolveOptions } from "@agentforge/types";
import { createDatabase } from "@agentforge/database";
import { createProvider } from "@agentforge/providers";
import { ToolRegistryImpl, createBuiltinTools, createHttpTools, createKnowledgeSearchTool, createSkillContentTool, VolcanoEmbedding } from "@agentforge/tools";
import type { EmbeddingClient } from "@agentforge/tools";
import { SkillRegistryImpl, loadSkillsFromDirectory } from "@agentforge/skills";
import { AgentLoop } from "@agentforge/core";
import type { AppConfig } from "./config.js";

export interface AppContext {
  db: DatabaseAdapter;
  providerRegistry: ProviderRegistry;
  toolRegistry: ToolRegistryImpl;
  skillRegistry: SkillRegistryImpl;
  agentLoop: AgentLoop;
  embedder?: EmbeddingClient;
  config: AppConfig;
}

interface ProviderEntry {
  provider: LLMProvider;
  defaultModel: string;
  capabilities: ModelCapabilities;
}

interface ResolvedProviderCandidate {
  providerId: string;
  model: string;
  entry: ProviderEntry;
}

const MAX_ATTEMPTS_PER_CANDIDATE = 2;
const DEFAULT_FALLBACK_COOLDOWN_MS = 15 * 60 * 1000;

export class ProviderRegistry {
  private providers = new Map<string, ProviderEntry>();
  private primaryId: string | null = null;
  /** cooldown key: `${agentKey}:${providerId}:${model}` */
  private cooldowns = new Map<string, number>();

  register(id: string, provider: LLMProvider, isPrimary: boolean, defaultModel = "", capabilities?: ModelCapabilities) {
    this.providers.set(id, { provider, defaultModel, capabilities: capabilities ?? defaultModelCapabilities() });
    if (isPrimary) this.primaryId = id;
  }

  get(id: string): LLMProvider | undefined {
    return this.providers.get(id)?.provider;
  }

  getPrimary(): LLMProvider | undefined {
    if (this.primaryId) return this.providers.get(this.primaryId)?.provider;
    const first = this.providers.values().next();
    return first.done ? undefined : first.value.provider;
  }

  resolve(candidates: ProviderCandidate[], agentKey: string = "*", options?: ProviderResolveOptions): LLMProvider {
    const resolved = this.resolveCandidates(candidates, agentKey);
    if (resolved.length === 0) {
      throw new Error("All candidate models are unavailable or not configured");
    }
    const fallbackCooldownMs = Math.max(0, options?.fallbackCooldownMs ?? DEFAULT_FALLBACK_COOLDOWN_MS);
    return this.wrapWithFailover(agentKey, resolved, fallbackCooldownMs);
  }

  private cdKey(agentKey: string, providerId: string, model: string): string {
    return `${agentKey}:${providerId}:${model}`;
  }

  private isAvailable(agentKey: string, providerId: string, model: string): boolean {
    const until = this.cooldowns.get(this.cdKey(agentKey, providerId, model));
    if (!until) return true;
    if (Date.now() >= until) {
      this.cooldowns.delete(this.cdKey(agentKey, providerId, model));
      return true;
    }
    return false;
  }

  private markDown(agentKey: string, providerId: string, model: string, fallbackCooldownMs: number): void {
    if (fallbackCooldownMs <= 0) return;
    this.cooldowns.set(this.cdKey(agentKey, providerId, model), Date.now() + fallbackCooldownMs);
  }

  private getDefaultProviderId(): string | undefined {
    if (this.primaryId && this.providers.has(this.primaryId)) return this.primaryId;
    return this.providers.keys().next().value;
  }

  private resolveCandidates(candidates: ProviderCandidate[], agentKey: string): ResolvedProviderCandidate[] {
    const result: ResolvedProviderCandidate[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const providerId = candidate.providerId?.trim() || this.getDefaultProviderId();
      if (!providerId) continue;
      const entry = this.providers.get(providerId);
      if (!entry) continue;
      const model = candidate.model?.trim() || entry.defaultModel.trim();
      if (!model) continue;
      const key = `${providerId}:${model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.isAvailable(agentKey, providerId, model)) {
        result.push({ providerId, model, entry });
      }
    }
    return result;
  }

  private formatCandidateError(candidate: ResolvedProviderCandidate, attempt: number, error: unknown): string {
    return `${candidate.providerId}/${candidate.model}#${attempt}: ${(error as Error).message}`;
  }

  private getIncompatibilityReason(candidate: ResolvedProviderCandidate, request: LLMRequest): string | undefined {
    const caps = candidate.entry.capabilities;
    if (request.thinking && !caps.supportsThinking) return "model does not support thinking";
    if (request.tools?.length && !caps.supportsTools) return "model does not support tools";
    if (requestHasImages(request.messages) && !caps.supportsVision) return "model does not support image input";
    return undefined;
  }

  private buildModelTrace(
    requestedModel: string,
    attempts: ModelTraceAttempt[],
    selected?: ResolvedProviderCandidate
  ): ModelTrace {
    return {
      requestedModel,
      selectedProviderId: selected?.providerId,
      selectedModel: selected?.model,
      fallbackUsed: attempts.slice(0, -1).some((attempt) => attempt.status !== "success"),
      attempts: [...attempts],
    };
  }

  private wrapWithFailover(agentKey: string, candidates: ResolvedProviderCandidate[], fallbackCooldownMs: number): LLMProvider {
    const registry = this;
    return {
      name: candidates[0].entry.provider.name,
      chat: async (request) => {
        const errors: string[] = [];
        const attempts: ModelTraceAttempt[] = [];
        for (const candidate of candidates) {
          const reason = registry.getIncompatibilityReason(candidate, request);
          if (reason) {
            attempts.push({ providerId: candidate.providerId, model: candidate.model, attempt: 0, status: "skipped", error: reason });
            errors.push(`${candidate.providerId}/${candidate.model}: ${reason}`);
            continue;
          }
          for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_CANDIDATE; attempt++) {
            try {
              const response = await candidate.entry.provider.chat({ ...request, model: candidate.model });
              attempts.push({ providerId: candidate.providerId, model: candidate.model, attempt, status: "success" });
              return {
                ...response,
                model: response.model || candidate.model,
                modelTrace: this.buildModelTrace(request.model, attempts, candidate),
              };
            } catch (error) {
              errors.push(registry.formatCandidateError(candidate, attempt, error));
              attempts.push({
                providerId: candidate.providerId,
                model: candidate.model,
                attempt,
                status: "failed",
                error: (error as Error).message,
              });
              if (attempt === MAX_ATTEMPTS_PER_CANDIDATE) {
                registry.markDown(agentKey, candidate.providerId, candidate.model, fallbackCooldownMs);
              }
            }
          }
        }
        throw new Error(`All candidate models failed: ${errors.join(" | ")}`);
      },
      stream: async function* (request) {
        const errors: string[] = [];
        const attempts: ModelTraceAttempt[] = [];
        for (const candidate of candidates) {
          const reason = registry.getIncompatibilityReason(candidate, request);
          if (reason) {
            attempts.push({ providerId: candidate.providerId, model: candidate.model, attempt: 0, status: "skipped", error: reason });
            errors.push(`${candidate.providerId}/${candidate.model}: ${reason}`);
            continue;
          }
          for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_CANDIDATE; attempt++) {
            let emittedChunk = false;
            try {
              for await (const chunk of candidate.entry.provider.stream({ ...request, model: candidate.model })) {
                emittedChunk = true;
                yield chunk.type === "done"
                  ? {
                      ...chunk,
                      model: chunk.model ?? candidate.model,
                      modelTrace: registry.buildModelTrace(request.model, [
                        ...attempts,
                        { providerId: candidate.providerId, model: candidate.model, attempt, status: "success" },
                      ], candidate),
                    }
                  : chunk;
              }
              return;
            } catch (error) {
              if (emittedChunk) {
                registry.markDown(agentKey, candidate.providerId, candidate.model, fallbackCooldownMs);
                throw error;
              }
              errors.push(registry.formatCandidateError(candidate, attempt, error));
              attempts.push({
                providerId: candidate.providerId,
                model: candidate.model,
                attempt,
                status: "failed",
                error: (error as Error).message,
              });
              if (attempt === MAX_ATTEMPTS_PER_CANDIDATE) {
                registry.markDown(agentKey, candidate.providerId, candidate.model, fallbackCooldownMs);
              }
            }
          }
        }
        throw new Error(`All candidate models failed: ${errors.join(" | ")}`);
      },
    } as LLMProvider;
  }

  async reload(db: DatabaseAdapter) {
    this.providers.clear();
    this.primaryId = null;
    this.cooldowns.clear();
    for (const pc of await db.listProviders()) {
      if (!pc.enabled) continue;
      try {
        const provider = createProvider(pc.type, { apiKey: pc.apiKey, baseUrl: pc.baseUrl });
        this.register(pc.id, provider, pc.isPrimary, pc.defaultModel, pc.capabilities);
      } catch {
        // skip invalid providers
      }
    }
  }
}

function defaultModelCapabilities(): ModelCapabilities {
  return {
    supportsTools: true,
    supportsVision: true,
    supportsThinking: false,
    supportsStreaming: true,
  };
}

function requestHasImages(messages: LLMMessage[]): boolean {
  return messages.some((message) => {
    if (!Array.isArray(message.content)) return false;
    return message.content.some((block: ContentBlock) => block.type === "image");
  });
}

export async function bootstrap(config: AppConfig): Promise<AppContext> {
  const db = await createDatabase(config.database);

  if ((await db.listProviders()).length === 0) {
    const typeMap: Record<string, string> = { claude: "Anthropic Claude", openai: "OpenAI Compatible" };
    await db.createProvider({
      name: typeMap[config.llmProvider] ?? config.llmProvider,
      type: config.llmProvider,
      apiKey: config.llmApiKey,
      baseUrl: config.llmBaseUrl,
      defaultModel: config.defaultModel,
      isPrimary: true,
    });
  }

  const providerRegistry = new ProviderRegistry();
  await providerRegistry.reload(db);

  const toolRegistry = new ToolRegistryImpl();
  for (const tool of createBuiltinTools()) {
    toolRegistry.register(tool);
  }
  for (const tool of createHttpTools(await db.listHttpTools())) {
    toolRegistry.register(tool);
  }

  const skillRegistry = new SkillRegistryImpl();
  const skillsDir = resolve(process.cwd(), "skills");
  for (const skill of loadSkillsFromDirectory(skillsDir)) {
    skillRegistry.register(skill);
  }

  const agentLoop = new AgentLoop({
    providerRegistry,
    toolRegistry,
    skillRegistry,
    db,
  });

  let embedder: EmbeddingClient | undefined;
  const embKey = process.env.VOLCANO_EMBEDDING_KEY;
  if (embKey) {
    embedder = new VolcanoEmbedding({
      apiKey: embKey,
      model: process.env.VOLCANO_EMBEDDING_MODEL,
    });
  }

  toolRegistry.register(createKnowledgeSearchTool(db, embedder));
  toolRegistry.register(createSkillContentTool(skillRegistry));

  return { db, providerRegistry, toolRegistry, skillRegistry, agentLoop, embedder, config };
}
