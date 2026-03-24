import { describe, it, expect } from "vitest";
import { createProvider, ClaudeProvider, OpenAIProvider } from "../src/index.js";

describe("createProvider", () => {
  it("returns ClaudeProvider for 'claude'", () => {
    const provider = createProvider("claude", { apiKey: "test-key" });
    expect(provider).toBeInstanceOf(ClaudeProvider);
    expect(provider.name).toBe("claude");
  });

  it("returns OpenAIProvider for 'openai'", () => {
    const provider = createProvider("openai", { apiKey: "test-key" });
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe("openai");
  });

  it("throws for unknown provider type", () => {
    expect(() => createProvider("unknown", { apiKey: "test-key" })).toThrow(
      "Unknown provider: unknown"
    );
  });

  it("passes baseUrl config through", () => {
    const provider = createProvider("claude", {
      apiKey: "test-key",
      baseUrl: "https://custom.api.example.com",
    });
    expect(provider).toBeInstanceOf(ClaudeProvider);
  });
});
