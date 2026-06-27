export interface AppConfig {
  port: number;
  dbPath: string;
  llmProvider: string;
  llmApiKey: string;
  llmBaseUrl?: string;
  defaultModel: string;
  adminSecret: string;
}

export function loadConfig(): AppConfig {
  const llmApiKey = process.env.LLM_API_KEY;
  if (!llmApiKey) {
    throw new Error("LLM_API_KEY environment variable is required");
  }

  return {
    port: parseInt(process.env.PORT ?? "3000", 10),
    dbPath: process.env.DB_PATH ?? process.env.DATABASE_URL ?? "data/agentforge.db",
    llmProvider: process.env.LLM_PROVIDER ?? "claude",
    llmApiKey,
    llmBaseUrl: process.env.LLM_BASE_URL || undefined,
    defaultModel: process.env.DEFAULT_MODEL ?? "claude-sonnet-4-20250514",
    adminSecret: process.env.ADMIN_SECRET || (() => {
      if (process.env.NODE_ENV === 'production') throw new Error('ADMIN_SECRET is required in production');
      return 'admin';
    })(),
  };
}
