export interface AppConfig {
  port: number;
  databaseType: string;
  databaseUrl: string;
  llmProvider: string;
  llmApiKey: string;
  llmBaseUrl?: string;
  adminSecret: string;
}

export function loadConfig(): AppConfig {
  const llmApiKey = process.env.LLM_API_KEY;
  if (!llmApiKey) {
    throw new Error("LLM_API_KEY environment variable is required");
  }

  return {
    port: parseInt(process.env.PORT ?? "3000", 10),
    databaseType: process.env.DATABASE_TYPE ?? "sqlite",
    databaseUrl: process.env.DATABASE_URL ?? "./data/agentforge.db",
    llmProvider: process.env.LLM_PROVIDER ?? "claude",
    llmApiKey,
    llmBaseUrl: process.env.LLM_BASE_URL || undefined,
    adminSecret: process.env.ADMIN_SECRET ?? "admin",
  };
}
