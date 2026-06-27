export type PreflightStatus = "pass" | "warn" | "fail";

export interface PreflightCheck {
  id: string;
  status: PreflightStatus;
  message: string;
  remediation?: string;
}

export interface PreflightReport {
  ok: boolean;
  checks: PreflightCheck[];
}

const UNSAFE_VALUES = new Set(["admin", "password", "change-me", "change-me-in-production", "change-me-mysql", "change-me-root"]);

export function runProductionPreflight(env: NodeJS.ProcessEnv = process.env): PreflightReport {
  const checks: PreflightCheck[] = [
    checkRequired("node_env", env.NODE_ENV, "NODE_ENV must be production.", "Set NODE_ENV=production."),
    checkRequired("llm_api_key", env.LLM_API_KEY, "LLM_API_KEY is configured.", "Set LLM_API_KEY to the customer's provider key."),
    checkSecret("admin_secret", env.ADMIN_SECRET, "ADMIN_SECRET is configured and not a demo value.", "Set a long random ADMIN_SECRET for emergency automation only."),
    checkSecret("admin_password", env.ADMIN_PASSWORD, "ADMIN_PASSWORD is configured and not a demo value.", "Set a strong bootstrap password, then rotate after SSO is configured."),
    checkRequired("admin_email", env.ADMIN_EMAIL, "ADMIN_EMAIL is configured.", "Set ADMIN_EMAIL to the initial enterprise owner account."),
    checkExact("auth_cookie_secure", env.AUTH_COOKIE_SECURE, "true", "AUTH_COOKIE_SECURE=true for HTTPS deployments.", "Set AUTH_COOKIE_SECURE=true behind HTTPS."),
    checkPublicUrl(env.PUBLIC_URL),
    checkCors(env.CORS_ORIGIN),
    ...checkDatabase(env),
  ];

  return {
    ok: checks.every((check) => check.status !== "fail"),
    checks,
  };
}

function checkRequired(id: string, value: string | undefined, message: string, remediation: string): PreflightCheck {
  if (value?.trim()) return { id, status: "pass", message };
  return { id, status: "fail", message: `${message} Missing value.`, remediation };
}

function checkSecret(id: string, value: string | undefined, message: string, remediation: string): PreflightCheck {
  if (!value?.trim()) return { id, status: "fail", message: `${message} Missing value.`, remediation };
  if (UNSAFE_VALUES.has(value.trim().toLowerCase())) {
    return { id, status: "fail", message: `${message} Demo value is not allowed.`, remediation };
  }
  if (value.trim().length < 12) {
    return { id, status: "warn", message: `${message} Value is short.`, remediation };
  }
  return { id, status: "pass", message };
}

function checkExact(id: string, value: string | undefined, expected: string, message: string, remediation: string): PreflightCheck {
  if (value === expected) return { id, status: "pass", message };
  return { id, status: "fail", message: `${message} Current value: ${value || "<unset>"}.`, remediation };
}

function checkCors(value: string | undefined): PreflightCheck {
  if (!value?.trim()) {
    return {
      id: "cors_origin",
      status: "fail",
      message: "CORS_ORIGIN must be an explicit HTTPS origin in production.",
      remediation: "Set CORS_ORIGIN=https://your-agentforge-domain.example.",
    };
  }
  const origin = value.trim();
  if (origin === "true" || origin === "*" || origin === "http://localhost:5173") {
    return {
      id: "cors_origin",
      status: "fail",
      message: `CORS_ORIGIN uses an unsafe production value: ${origin}.`,
      remediation: "Set a single HTTPS origin for the deployed admin UI.",
    };
  }
  if (!origin.startsWith("https://")) {
    return {
      id: "cors_origin",
      status: "warn",
      message: `CORS_ORIGIN is not HTTPS: ${origin}.`,
      remediation: "Use HTTPS for production admin UI traffic.",
    };
  }
  return { id: "cors_origin", status: "pass", message: "CORS_ORIGIN is explicit." };
}

function checkPublicUrl(value: string | undefined): PreflightCheck {
  if (!value?.trim()) {
    return {
      id: "public_url",
      status: "fail",
      message: "PUBLIC_URL must be configured for OIDC callback URLs.",
      remediation: "Set PUBLIC_URL=https://your-agentforge-domain.example.",
    };
  }
  const publicUrl = value.trim();
  if (!publicUrl.startsWith("https://")) {
    return {
      id: "public_url",
      status: "fail",
      message: `PUBLIC_URL must use HTTPS in production: ${publicUrl}.`,
      remediation: "Expose AgentForge behind HTTPS and set PUBLIC_URL to that origin.",
    };
  }
  return { id: "public_url", status: "pass", message: "PUBLIC_URL is configured." };
}

function checkDatabase(env: NodeJS.ProcessEnv): PreflightCheck[] {
  const dbType = env.DB_TYPE?.trim().toLowerCase();
  const databaseUrl = env.DATABASE_URL?.trim();
  const mysqlUrl = env.MYSQL_URL?.trim() || (databaseUrl?.startsWith("mysql://") || databaseUrl?.startsWith("mysql2://") ? databaseUrl : undefined);

  if (dbType && !["sqlite", "mysql"].includes(dbType)) {
    return [{
      id: "database_type",
      status: "fail",
      message: `DB_TYPE must be sqlite or mysql. Current value: ${dbType}.`,
      remediation: "Set DB_TYPE=mysql for production private-cloud deployments, or DB_TYPE=sqlite for a persistent single-node install.",
    }];
  }

  if (dbType === "mysql" || mysqlUrl) {
    return [
      { id: "database_type", status: "pass", message: "DB_TYPE is mysql." },
      checkMySQLConfig(env, mysqlUrl),
    ];
  }

  return [
    {
      id: "database_type",
      status: "warn",
      message: "DB_TYPE is sqlite. Use MySQL for multi-user private-cloud production deployments.",
      remediation: "Set DB_TYPE=mysql plus MYSQL_HOST/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE, or MYSQL_URL.",
    },
    checkDatabasePath(env.DB_PATH ?? env.DATABASE_URL),
  ];
}

function checkMySQLConfig(env: NodeJS.ProcessEnv, mysqlUrl: string | undefined): PreflightCheck {
  if (mysqlUrl) {
    try {
      const url = new URL(mysqlUrl);
      const hasDatabase = url.pathname.replace(/^\//, "").trim().length > 0;
      if ((url.protocol === "mysql:" || url.protocol === "mysql2:") && url.hostname && url.username && hasDatabase) {
        return { id: "mysql_config", status: "pass", message: "MySQL connection URL is configured." };
      }
    } catch {
      // fall through
    }
    return {
      id: "mysql_config",
      status: "fail",
      message: "MYSQL_URL must be a valid mysql:// URL with host, user, and database.",
      remediation: "Use mysql://user:password@host:3306/database or discrete MYSQL_* variables.",
    };
  }

  const missing = ["MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"].filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    return {
      id: "mysql_config",
      status: "fail",
      message: `Missing MySQL settings: ${missing.join(", ")}.`,
      remediation: "Set MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE.",
    };
  }
  if (UNSAFE_VALUES.has(env.MYSQL_PASSWORD!.trim().toLowerCase())) {
    return {
      id: "mysql_config",
      status: "fail",
      message: "MYSQL_PASSWORD uses a demo value.",
      remediation: "Set a strong customer-specific database password.",
    };
  }
  return { id: "mysql_config", status: "pass", message: "MySQL discrete settings are configured." };
}

function checkDatabasePath(value: string | undefined): PreflightCheck {
  if (!value?.trim()) {
    return {
      id: "database_path",
      status: "fail",
      message: "DB_PATH or DATABASE_URL must be configured.",
      remediation: "Set DB_PATH to a persistent volume path, or wire the production database adapter.",
    };
  }
  const dbPath = value.trim();
  if (dbPath === "data/agentforge.db") {
    return {
      id: "database_path",
      status: "warn",
      message: "DB_PATH uses the local development default.",
      remediation: "Use an absolute path on a persistent volume, such as /app/data/agentforge.db.",
    };
  }
  return { id: "database_path", status: "pass", message: "Database path is configured." };
}
