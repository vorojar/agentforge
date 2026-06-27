import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("loadConfig", () => {
  it("requires LLM_API_KEY", () => {
    delete process.env.LLM_API_KEY;

    expect(() => loadConfig()).toThrow("LLM_API_KEY environment variable is required");
  });

  it("prefers DB_PATH and keeps DATABASE_URL as a compatibility fallback", () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.DB_PATH = "data/preferred.db";
    process.env.DATABASE_URL = "data/legacy.db";

    expect(loadConfig().dbPath).toBe("data/preferred.db");

    delete process.env.DB_PATH;
    expect(loadConfig().dbPath).toBe("data/legacy.db");
  });
});
