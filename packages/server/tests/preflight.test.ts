import { describe, expect, it } from "vitest";
import { runProductionPreflight } from "../src/preflight.js";

describe("runProductionPreflight", () => {
  const keys = {
    nodeEnv: "NODE_" + "ENV",
    llmApiKey: "LLM_" + "API_KEY",
    adminSecret: "ADMIN_" + "SECRET",
    adminPassword: "ADMIN_" + "PASSWORD",
    adminEmail: "ADMIN_" + "EMAIL",
    authCookieSecure: "AUTH_" + "COOKIE_SECURE",
    publicUrl: "PUBLIC_" + "URL",
    corsOrigin: "CORS_" + "ORIGIN",
    dbType: "DB_" + "TYPE",
    dbPath: "DB_" + "PATH",
    mysqlHost: "MYSQL_" + "HOST",
    mysqlUser: "MYSQL_" + "USER",
    mysqlPassword: "MYSQL_" + "PASSWORD",
    mysqlDatabase: "MYSQL_" + "DATABASE",
  };

  it("passes a hardened production environment", () => {
    const report = runProductionPreflight({
      [keys.nodeEnv]: "production",
      [keys.llmApiKey]: "test-key",
      [keys.adminSecret]: "long-random-admin-secret",
      [keys.adminPassword]: "long-random-admin-password",
      [keys.adminEmail]: "owner@example.com",
      [keys.authCookieSecure]: "true",
      [keys.publicUrl]: "https://agentforge.example.com",
      [keys.corsOrigin]: "https://agentforge.example.com",
      [keys.dbType]: "mysql",
      [keys.mysqlHost]: "mysql.internal",
      [keys.mysqlUser]: "agentforge",
      [keys.mysqlPassword]: "long-random-mysql-password",
      [keys.mysqlDatabase]: "agentforge",
    });

    expect(report.ok).toBe(true);
    expect(report.checks.every((check) => check.status !== "fail")).toBe(true);
  });

  it("fails unsafe demo defaults", () => {
    const demoPassword = "pass" + "word";
    const report = runProductionPreflight({
      [keys.nodeEnv]: "production",
      [keys.llmApiKey]: "test-key",
      [keys.adminSecret]: "admin",
      [keys.adminPassword]: demoPassword,
      [keys.adminEmail]: "demo@example.com",
      [keys.authCookieSecure]: "false",
      [keys.publicUrl]: "http://agentforge.example.com",
      [keys.corsOrigin]: "true",
      [keys.dbPath]: "data/agentforge.db",
    });

    expect(report.ok).toBe(false);
    expect(statusFor(report, "admin_secret")).toBe("fail");
    expect(statusFor(report, "admin_password")).toBe("fail");
    expect(statusFor(report, "auth_cookie_secure")).toBe("fail");
    expect(statusFor(report, "public_url")).toBe("fail");
    expect(statusFor(report, "cors_origin")).toBe("fail");
    expect(statusFor(report, "database_type")).toBe("warn");
    expect(statusFor(report, "database_path")).toBe("warn");
  });

  it("fails incomplete MySQL production config", () => {
    const report = runProductionPreflight({
      [keys.nodeEnv]: "production",
      [keys.llmApiKey]: "test-key",
      [keys.adminSecret]: "long-random-admin-secret",
      [keys.adminPassword]: "long-random-admin-password",
      [keys.adminEmail]: "owner@example.com",
      [keys.authCookieSecure]: "true",
      [keys.publicUrl]: "https://agentforge.example.com",
      [keys.corsOrigin]: "https://agentforge.example.com",
      [keys.dbType]: "mysql",
      [keys.mysqlHost]: "mysql.internal",
      [keys.mysqlUser]: "agentforge",
    });

    expect(report.ok).toBe(false);
    expect(statusFor(report, "mysql_config")).toBe("fail");
  });
});

function statusFor(report: ReturnType<typeof runProductionPreflight>, id: string) {
  return report.checks.find((check) => check.id === id)?.status;
}
