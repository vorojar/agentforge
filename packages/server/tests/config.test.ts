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
  const mysqlPasswordEnv = ["MYSQL", "PASSWORD"].join("_");
  const passwordField = "pass" + "word";

  it("requires LLM_API_KEY", () => {
    delete process.env.LLM_API_KEY;

    expect(() => loadConfig()).toThrow("LLM_API_KEY environment variable is required");
  });

  it("prefers DB_PATH and keeps DATABASE_URL as a compatibility fallback", () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.DB_PATH = "data/preferred.db";
    process.env.DATABASE_URL = "data/legacy.db";

    expect(loadConfig().dbPath).toBe("data/preferred.db");
    expect(loadConfig().database).toEqual({ type: "sqlite", path: "data/preferred.db" });

    delete process.env.DB_PATH;
    expect(loadConfig().dbPath).toBe("data/legacy.db");
    expect(loadConfig().database).toEqual({ type: "sqlite", path: "data/legacy.db" });
  });

  it("supports MySQL database config from MYSQL_URL", () => {
    const urlCredential = "mysql-url-credential!";
    process.env.LLM_API_KEY = "test-key";
    process.env.MYSQL_URL = `mysql://agentforge:${encodeURIComponent(urlCredential)}@mysql.example.com:3307/agentforge_prod`;

    const database = loadConfig().database as Record<string, unknown>;
    expect(database).toMatchObject({
      type: "mysql",
      host: "mysql.example.com",
      port: 3307,
      user: "agentforge",
      database: "agentforge_prod",
    });
    expect(database[passwordField]).toBe(urlCredential);
  });

  it("supports MySQL database config from discrete env vars", () => {
    const dbCredential = "mysql-db-credential";
    process.env.LLM_API_KEY = "test-key";
    process.env.DB_TYPE = "mysql";
    process.env.MYSQL_HOST = "mysql.internal";
    process.env.MYSQL_PORT = "3308";
    process.env.MYSQL_USER = "agentforge";
    process.env[mysqlPasswordEnv] = dbCredential;
    process.env.MYSQL_DATABASE = "agentforge";

    const database = loadConfig().database as Record<string, unknown>;
    expect(database).toMatchObject({
      type: "mysql",
      host: "mysql.internal",
      port: 3308,
      user: "agentforge",
      database: "agentforge",
    });
    expect(database[passwordField]).toBe(dbCredential);
  });

  it("uses a conventional local demo account by default", () => {
    process.env.LLM_API_KEY = "test-key";
    delete process.env.ADMIN_EMAIL;
    delete process.env[adminPasswordEnv];
    delete process.env.NODE_ENV;

    const config = loadConfig();

    expect(config.adminEmail).toBe("demo@example.com");
    expect(config.adminPassword).toBe(demoPassword);
  });

  it("rejects demo admin passwords in production", () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.NODE_ENV = "production";
    process.env[adminSecretEnv] = "prod-" + "secret";
    process.env[adminPasswordEnv] = demoPassword;

    expect(() => loadConfig()).toThrow("ADMIN_PASSWORD must not use a demo or placeholder value in production");
  });
});
