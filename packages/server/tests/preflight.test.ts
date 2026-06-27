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
    corsOrigin: "CORS_" + "ORIGIN",
    dbPath: "DB_" + "PATH",
  };

  it("passes a hardened production environment", () => {
    const report = runProductionPreflight({
      [keys.nodeEnv]: "production",
      [keys.llmApiKey]: "test-key",
      [keys.adminSecret]: "long-random-admin-secret",
      [keys.adminPassword]: "long-random-admin-password",
      [keys.adminEmail]: "owner@example.com",
      [keys.authCookieSecure]: "true",
      [keys.corsOrigin]: "https://agentforge.example.com",
      [keys.dbPath]: "/app/data/agentforge.db",
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
      [keys.corsOrigin]: "true",
      [keys.dbPath]: "data/agentforge.db",
    });

    expect(report.ok).toBe(false);
    expect(statusFor(report, "admin_secret")).toBe("fail");
    expect(statusFor(report, "admin_password")).toBe("fail");
    expect(statusFor(report, "auth_cookie_secure")).toBe("fail");
    expect(statusFor(report, "cors_origin")).toBe("fail");
    expect(statusFor(report, "database_path")).toBe("warn");
  });
});

function statusFor(report: ReturnType<typeof runProductionPreflight>, id: string) {
  return report.checks.find((check) => check.id === id)?.status;
}
