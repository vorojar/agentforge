export interface AppConfig {
  port: number;
  dbPath: string;
  llmProvider: string;
  llmApiKey: string;
  llmBaseUrl?: string;
  defaultModel: string;
  adminSecret: string;
  adminEmail: string;
  adminPassword: string;
  sessionTtlDays: number;
  publicUrl?: string;
}

export function loadConfig(): AppConfig {
  const llmApiKey = process.env.LLM_API_KEY;
  if (!llmApiKey) {
    throw new Error("LLM_API_KEY environment variable is required");
  }

  const adminPassword = process.env.ADMIN_PASSWORD || (() => {
    if (process.env.NODE_ENV === "production") throw new Error("ADMIN_PASSWORD is required in production");
    return "password";
  })();
  if (process.env.NODE_ENV === "production" && isDemoPassword(adminPassword)) {
    throw new Error("ADMIN_PASSWORD must not use a demo or placeholder value in production");
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
    adminEmail: process.env.ADMIN_EMAIL ?? "demo@example.com",
    adminPassword,
    sessionTtlDays: parseInt(process.env.AUTH_SESSION_DAYS ?? "7", 10),
    publicUrl: process.env.PUBLIC_URL || undefined,
  };
}

function isDemoPassword(password: string): boolean {
  return ["admin", "password", "change-me", "change-me-in-production"].includes(password.trim().toLowerCase());
}
