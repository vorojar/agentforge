import { resolve } from "node:path";
import type { DatabaseAdapter, LLMProvider } from "@agentforge/types";
import { createDatabase } from "@agentforge/database";
import { createProvider } from "@agentforge/providers";
import { ToolRegistryImpl, createBuiltinTools } from "@agentforge/tools";
import { SkillRegistryImpl, loadSkillsFromDirectory } from "@agentforge/skills";
import { AgentLoop } from "@agentforge/core";
import type { AppConfig } from "./config.js";

export interface AppContext {
  db: DatabaseAdapter;
  provider: LLMProvider;
  toolRegistry: ToolRegistryImpl;
  skillRegistry: SkillRegistryImpl;
  agentLoop: AgentLoop;
  config: AppConfig;
}

export function bootstrap(config: AppConfig): AppContext {
  const db = createDatabase(config.databaseType, config.databaseUrl);

  const provider = createProvider(config.llmProvider, {
    apiKey: config.llmApiKey,
    baseUrl: config.llmBaseUrl,
  });

  const toolRegistry = new ToolRegistryImpl();
  for (const tool of createBuiltinTools()) {
    toolRegistry.register(tool);
  }

  const skillRegistry = new SkillRegistryImpl();
  const skillsDir = resolve(process.cwd(), "skills");
  for (const skill of loadSkillsFromDirectory(skillsDir)) {
    skillRegistry.register(skill);
  }

  const agentLoop = new AgentLoop({
    provider,
    toolRegistry,
    skillRegistry,
    db,
  });

  return { db, provider, toolRegistry, skillRegistry, agentLoop, config };
}
