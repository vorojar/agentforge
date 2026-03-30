import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { DatabaseAdapter, LLMProvider, ProviderConfig, Tool } from "@agentforge/types";
import { createDatabase } from "@agentforge/database";
import { createProvider } from "@agentforge/providers";
import { ToolRegistryImpl, createBuiltinTools, createHttpTools, createKnowledgeSearchTool, VolcanoEmbedding } from "@agentforge/tools";
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

/** Maps provider DB id → LLMProvider instance */
export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();
  private primaryId: string | null = null;
  private cooldowns = new Map<string, number>();
  private cooldownMs = 60_000;

  register(id: string, provider: LLMProvider, isPrimary: boolean) {
    this.providers.set(id, provider);
    if (isPrimary) this.primaryId = id;
  }

  get(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  getPrimary(): LLMProvider | undefined {
    if (this.primaryId) return this.providers.get(this.primaryId);
    // Fallback: first registered
    const first = this.providers.values().next();
    return first.done ? undefined : first.value;
  }

  /** Resolve provider for an agent: by providerId or fallback to primary, with failover */
  resolve(providerId?: string): LLMProvider {
    // If specific provider requested, try it first
    if (providerId) {
      const p = this.providers.get(providerId);
      if (p && this.isAvailable(providerId)) return this.wrapWithFailover(providerId, p);
    }
    // Try primary
    if (this.primaryId && this.isAvailable(this.primaryId)) {
      const p = this.providers.get(this.primaryId);
      if (p) return this.wrapWithFailover(this.primaryId, p);
    }
    // Fallback: first available
    for (const [id, p] of this.providers) {
      if (this.isAvailable(id)) return this.wrapWithFailover(id, p);
    }
    throw new Error("All LLM providers are unavailable (in cooldown)");
  }

  private isAvailable(id: string): boolean {
    const until = this.cooldowns.get(id);
    if (!until) return true;
    if (Date.now() >= until) {
      this.cooldowns.delete(id);
      return true;
    }
    return false;
  }

  private markDown(id: string): void {
    this.cooldowns.set(id, Date.now() + this.cooldownMs);
  }

  private wrapWithFailover(primaryId: string, primary: LLMProvider): LLMProvider {
    const registry = this;
    return {
      name: primary.name,
      chat: async (request) => {
        try {
          return await primary.chat(request);
        } catch (error) {
          registry.markDown(primaryId);
          for (const [id, p] of registry.providers) {
            if (id !== primaryId && registry.isAvailable(id)) {
              try {
                return await p.chat(request);
              } catch {
                registry.markDown(id);
              }
            }
          }
          throw error;
        }
      },
      stream: async function* (request) {
        try {
          yield* primary.stream(request);
        } catch (error) {
          registry.markDown(primaryId);
          for (const [id, p] of registry.providers) {
            if (id !== primaryId && registry.isAvailable(id)) {
              try {
                yield* p.stream(request);
                return;
              } catch {
                registry.markDown(id);
              }
            }
          }
          throw error;
        }
      },
    } as LLMProvider;
  }

  reload(db: DatabaseAdapter) {
    this.providers.clear();
    this.primaryId = null;
    for (const pc of db.listProviders()) {
      if (!pc.enabled) continue;
      try {
        const provider = createProvider(pc.type, { apiKey: pc.apiKey, baseUrl: pc.baseUrl });
        this.register(pc.id, provider, pc.isPrimary);
      } catch {
        // skip invalid providers
      }
    }
  }
}

export function bootstrap(config: AppConfig): AppContext {
  const db = createDatabase(config.databaseType, config.databaseUrl);

  // Auto-create default provider from env if no providers exist
  if (db.listProviders().length === 0) {
    const typeMap: Record<string, string> = { claude: "Anthropic Claude", openai: "OpenAI Compatible" };
    db.createProvider({
      name: typeMap[config.llmProvider] ?? config.llmProvider,
      type: config.llmProvider,
      apiKey: config.llmApiKey,
      baseUrl: config.llmBaseUrl,
      defaultModel: config.defaultModel,
      isPrimary: true,
    });
  }

  const providerRegistry = new ProviderRegistry();
  providerRegistry.reload(db);

  const toolRegistry = new ToolRegistryImpl();
  for (const tool of createBuiltinTools()) {
    toolRegistry.register(tool);
  }
  for (const tool of createHttpTools(db.listHttpTools())) {
    toolRegistry.register(tool);
  }
  // Embedder created later — register knowledge tool after embedder init
  // (moved below)

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

  // Create embedding client if configured
  let embedder: EmbeddingClient | undefined;
  const embKey = process.env.VOLCANO_EMBEDDING_KEY;
  if (embKey) {
    embedder = new VolcanoEmbedding({
      apiKey: embKey,
      model: process.env.VOLCANO_EMBEDDING_MODEL,
    });
  }

  toolRegistry.register(createKnowledgeSearchTool(db, embedder));

  // read_skill_file tool — lets LLM read supporting files from skill directories on demand
  const readSkillFileTool: Tool = {
    name: "read_skill_file",
    description: "Read a supporting file from a skill directory (e.g. template.md, examples/sample.md, references/api-docs.md). Use when skill instructions reference additional files.",
    parameters: {
      type: "object",
      properties: {
        skill: { type: "string", description: "Skill name (directory name)" },
        path: { type: "string", description: "Relative file path (e.g. 'template.md', 'references/data.md')" },
      },
      required: ["skill", "path"],
    },
    async execute(input) {
      const skillName = input.skill as string;
      const filePath = input.path as string;
      if (filePath.includes("..") || skillName.includes("..")) return { content: "Invalid path", isError: true };
      if (!filePath.endsWith(".md")) return { content: "Only .md files allowed", isError: true };
      const fullPath = join(skillsDir, skillName, filePath);
      if (!existsSync(fullPath)) return { content: `File not found: ${filePath}`, isError: true };
      return { content: readFileSync(fullPath, "utf-8") };
    },
  };
  toolRegistry.register(readSkillFileTool);

  return { db, providerRegistry, toolRegistry, skillRegistry, agentLoop, embedder, config };
}
