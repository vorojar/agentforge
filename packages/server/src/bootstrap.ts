import { resolve } from "node:path";
import type { DatabaseAdapter, LLMProvider, ProviderConfig } from "@agentforge/types";
import { createDatabase } from "@agentforge/database";
import { createProvider } from "@agentforge/providers";
import { ToolRegistryImpl, createBuiltinTools, createHttpTools } from "@agentforge/tools";
import { SkillRegistryImpl, loadSkillsFromDirectory } from "@agentforge/skills";
import { AgentLoop } from "@agentforge/core";
import type { AppConfig } from "./config.js";

export interface AppContext {
  db: DatabaseAdapter;
  providerRegistry: ProviderRegistry;
  toolRegistry: ToolRegistryImpl;
  skillRegistry: SkillRegistryImpl;
  agentLoop: AgentLoop;
  config: AppConfig;
}

/** Maps provider DB id → LLMProvider instance */
export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();
  private primaryId: string | null = null;

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

  /** Resolve provider for an agent: by providerId or fallback to primary */
  resolve(providerId?: string): LLMProvider {
    if (providerId) {
      const p = this.providers.get(providerId);
      if (p) return p;
    }
    const primary = this.getPrimary();
    if (!primary) throw new Error("No LLM provider configured");
    return primary;
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

  return { db, providerRegistry, toolRegistry, skillRegistry, agentLoop, config };
}
