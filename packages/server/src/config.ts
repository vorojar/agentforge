export interface AppConfig {
  port: number;
  dbType: DatabaseConfig["type"];
  dbPath: string;
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
  | { type: "sqlite"; path: string }
  | ({ type: "mysql" } & MySQLConfig);

export interface MySQLConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
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
    dbPath: database.type === "sqlite" ? database.path : "",
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
  const mysqlUrl = env.MYSQL_URL?.trim() || (databaseUrl?.startsWith("mysql://") || databaseUrl?.startsWith("mysql2://") ? databaseUrl : undefined);
  const dbType = normalizeDatabaseType(env.DB_TYPE, mysqlUrl);

  if (dbType === "mysql") {
    return { type: "mysql", ...loadMySQLConfig(env, mysqlUrl) };
  }

  return {
    type: "sqlite",
    path: env.DB_PATH ?? databaseUrl ?? "data/agentforge.db",
  };
}

function normalizeDatabaseType(value: string | undefined, mysqlUrl: string | undefined): DatabaseConfig["type"] {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return mysqlUrl ? "mysql" : "sqlite";
  if (normalized === "sqlite" || normalized === "mysql") return normalized;
  throw new Error(`Unsupported DB_TYPE: ${value}`);
}

function loadMySQLConfig(env: NodeJS.ProcessEnv, mysqlUrl: string | undefined): MySQLConfig {
  if (mysqlUrl) return parseMySQLUrl(mysqlUrl);

  const host = env.MYSQL_HOST?.trim();
  const user = env.MYSQL_USER?.trim();
  const password = env.MYSQL_PASSWORD;
  const database = env.MYSQL_DATABASE?.trim();
  if (!host || !user || password === undefined || !database) {
    throw new Error("MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE are required when DB_TYPE=mysql");
  }

  return {
    host,
    port: parseInt(env.MYSQL_PORT ?? "3306", 10),
    user,
    password,
    database,
  };
}

function parseMySQLUrl(value: string): MySQLConfig {
  const url = new URL(value);
  if (url.protocol !== "mysql:" && url.protocol !== "mysql2:") {
    throw new Error("MYSQL_URL must use mysql:// or mysql2://");
  }
  const database = url.pathname.replace(/^\//, "");
  if (!url.hostname || !url.username || !database) {
    throw new Error("MYSQL_URL must include host, user, and database");
  }
  return {
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(database),
  };
}
