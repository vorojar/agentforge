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

const UNSAFE_VALUES = new Set(["admin", "password", "change-me", "change-me-in-production", "change-me-postgres", "change-me-root"]);

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
  const postgresUrl = env.POSTGRES_URL?.trim() || (databaseUrl?.startsWith("postgres://") || databaseUrl?.startsWith("postgresql://") ? databaseUrl : undefined);

  if (dbType && !["postgres", "postgresql"].includes(dbType)) {
    return [{
      id: "database_type",
      status: "fail",
      message: `DB_TYPE must be postgres. Current value: ${dbType}.`,
      remediation: "Set DB_TYPE=postgres or omit DB_TYPE and provide PostgreSQL settings.",
    }];
  }

  return [
    { id: "database_type", status: "pass", message: "PostgreSQL is the configured database." },
    checkPostgresConfig(env, postgresUrl),
  ];
}

function checkPostgresConfig(env: NodeJS.ProcessEnv, postgresUrl: string | undefined): PreflightCheck {
  if (postgresUrl) {
    try {
      const url = new URL(postgresUrl);
      const hasDatabase = url.pathname.replace(/^\//, "").trim().length > 0;
      if ((url.protocol === "postgres:" || url.protocol === "postgresql:") && url.hostname && url.username && hasDatabase) {
        return { id: "postgres_config", status: "pass", message: "PostgreSQL connection URL is configured." };
      }
    } catch {
      // fall through
    }
    return {
      id: "postgres_config",
      status: "fail",
      message: "POSTGRES_URL or DATABASE_URL must be a valid postgres:// URL with host, user, and database.",
      remediation: "Use postgres://user:password@host:5432/database or discrete POSTGRES_* variables.",
    };
  }

  const missing = ["POSTGRES_PASSWORD"].filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    return {
      id: "postgres_config",
      status: "fail",
      message: `Missing PostgreSQL settings: ${missing.join(", ")}.`,
      remediation: "Set POSTGRES_PASSWORD, and optionally POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_DB.",
    };
  }
  if (UNSAFE_VALUES.has(env.POSTGRES_PASSWORD!.trim().toLowerCase())) {
    return {
      id: "postgres_config",
      status: "fail",
      message: "POSTGRES_PASSWORD uses a demo value.",
      remediation: "Set a strong customer-specific database password.",
    };
  }
  return { id: "postgres_config", status: "pass", message: "PostgreSQL discrete settings are configured." };
}
