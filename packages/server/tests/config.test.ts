import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("loadConfig", () => {
  const adminPasswordEnv = "ADMIN_" + "PASSWORD";
  const adminSecretEnv = "ADMIN_" + "SECRET";
  const demoPassword = "pass" + "word";
  const postgresPasswordEnv = ["POSTGRES", "PASSWORD"].join("_");
  const passwordField = "pass" + "word";

  it("requires LLM_API_KEY", () => {
    delete process.env.LLM_API_KEY;

    expect(() => loadConfig()).toThrow("LLM_API_KEY environment variable is required");
  });

  it("defaults to PostgreSQL discrete settings", () => {
    process.env.LLM_API_KEY = "test-key";
    process.env[postgresPasswordEnv] = "postgres-db-credential";

    expect(loadConfig().database).toEqual({
      type: "postgres",
      host: "postgres",
      port: 5432,
      user: "agentforge",
      password: "postgres-db-credential",
      database: "agentforge",
      ssl: false,
    });
  });

  it("supports PostgreSQL database config from DATABASE_URL", () => {
    const urlCredential = "postgres-url-credential!";
    process.env.LLM_API_KEY = "test-key";
    process.env.DATABASE_URL = `postgres://agentforge:${encodeURIComponent(urlCredential)}@postgres.example.com:5433/agentforge_prod?sslmode=require`;

    const database = loadConfig().database as Record<string, unknown>;
    expect(database).toMatchObject({
      type: "postgres",
      host: "postgres.example.com",
      port: 5433,
      user: "agentforge",
      database: "agentforge_prod",
      ssl: true,
    });
    expect(database[passwordField]).toBe(urlCredential);
  });

  it("supports PostgreSQL database config from discrete env vars", () => {
    const dbCredential = "postgres-db-credential";
    process.env.LLM_API_KEY = "test-key";
    process.env.DB_TYPE = "postgres";
    process.env.POSTGRES_HOST = "postgres.internal";
    process.env.POSTGRES_PORT = "5434";
    process.env.POSTGRES_USER = "agentforge";
    process.env[postgresPasswordEnv] = dbCredential;
    process.env.POSTGRES_DB = "agentforge";

    const database = loadConfig().database as Record<string, unknown>;
    expect(database).toMatchObject({
      type: "postgres",
      host: "postgres.internal",
      port: 5434,
      user: "agentforge",
      database: "agentforge",
    });
    expect(database[passwordField]).toBe(dbCredential);
  });

  it("uses a conventional local demo account by default", () => {
    process.env.LLM_API_KEY = "test-key";
    process.env[postgresPasswordEnv] = "postgres-db-credential";
    delete process.env.ADMIN_EMAIL;
    delete process.env[adminPasswordEnv];
    delete process.env.NODE_ENV;

    const config = loadConfig();

    expect(config.adminEmail).toBe("demo@example.com");
    expect(config.adminPassword).toBe(demoPassword);
  });

  it("rejects demo admin passwords in production", () => {
    process.env.LLM_API_KEY = "test-key";
    process.env[postgresPasswordEnv] = "postgres-db-credential";
    process.env.NODE_ENV = "production";
    process.env[adminSecretEnv] = "prod-" + "secret";
    process.env[adminPasswordEnv] = demoPassword;

    expect(() => loadConfig()).toThrow("ADMIN_PASSWORD must not use a demo or placeholder value in production");
  });
});
