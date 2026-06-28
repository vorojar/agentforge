export interface AppConfig {
  port: number;
  dbType: DatabaseConfig["type"];
  database: DatabaseConfig;
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

export type DatabaseConfig =
  { type: "postgres" } & PostgresConfig;

export interface PostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
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

  const database = loadDatabaseConfig(process.env);

  return {
    port: parseInt(process.env.PORT ?? "3000", 10),
    dbType: database.type,
    database,
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

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  const postgresUrl = env.POSTGRES_URL?.trim() || (databaseUrl?.startsWith("postgres://") || databaseUrl?.startsWith("postgresql://") ? databaseUrl : undefined);
  const dbType = normalizeDatabaseType(env.DB_TYPE, postgresUrl);

  return { type: dbType, ...loadPostgresConfig(env, postgresUrl) };
}

function normalizeDatabaseType(value: string | undefined, postgresUrl: string | undefined): DatabaseConfig["type"] {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "postgres";
  if (normalized === "postgres" || normalized === "postgresql") return "postgres";
  throw new Error(`Unsupported DB_TYPE: ${value}`);
}

function loadPostgresConfig(env: NodeJS.ProcessEnv, postgresUrl: string | undefined): PostgresConfig {
  if (postgresUrl) return parsePostgresUrl(postgresUrl);

  const host = env.POSTGRES_HOST?.trim() || "postgres";
  const user = env.POSTGRES_USER?.trim() || "agentforge";
  const password = env.POSTGRES_PASSWORD;
  const database = env.POSTGRES_DB?.trim() || "agentforge";
  if (!host || !user || password === undefined || !database) {
    throw new Error("POSTGRES_PASSWORD is required for PostgreSQL");
  }

  return {
    host,
    port: parseInt(env.POSTGRES_PORT ?? "5432", 10),
    user,
    password,
    database,
    ssl: env.POSTGRES_SSL === "true",
  };
}

function parsePostgresUrl(value: string): PostgresConfig {
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL/POSTGRES_URL must use postgres:// or postgresql://");
  }
  const database = url.pathname.replace(/^\//, "");
  if (!url.hostname || !url.username || !database) {
    throw new Error("DATABASE_URL/POSTGRES_URL must include host, user, and database");
  }
  return {
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(database),
    ssl: url.searchParams.get("sslmode") === "require",
  };
}
