import { describe, expect, it } from "vitest";
import type { LLMProvider, LLMRequest, LLMResponse, LLMStreamChunk } from "@agentforge/types";
import { ProviderRegistry } from "../src/bootstrap.js";

class StaticProvider implements LLMProvider {
  readonly name = "static";
  readonly seenModels: string[] = [];

  constructor(private readonly behavior: "fail" | "ok") {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    this.seenModels.push(request.model);
    if (this.behavior === "fail") {
      throw new Error(`failed ${request.model}`);
    }
    return {
      content: [{ type: "text", text: `ok:${request.model}` }],
      stopReason: "end_turn",
      model: request.model,
      usage: { tokensIn: 1, tokensOut: 2 },
    };
  }

  async *stream(_request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    yield { type: "done", stopReason: "end_turn", usage: { tokensIn: 0, tokensOut: 0 } };
  }
}

describe("ProviderRegistry", () => {
  it("falls back to the next provider/model candidate and reports the actual model", async () => {
    const failing = new StaticProvider("fail");
    const fallback = new StaticProvider("ok");
    const registry = new ProviderRegistry();
    registry.register("primary", failing, true, "primary-model");
    registry.register("backup", fallback, false, "backup-default");

    const provider = registry.resolve([
      { providerId: "primary", model: "primary-model" },
      { providerId: "backup", model: "backup-model" },
    ], "agent-1", { fallbackCooldownMs: 60_000 });

    const response = await provider.chat({
      model: "ignored-model",
      systemPrompt: "system",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(failing.seenModels).toEqual(["primary-model", "primary-model"]);
    expect(fallback.seenModels).toEqual(["backup-model"]);
    expect(response.model).toBe("backup-model");
    expect(response.content).toEqual([{ type: "text", text: "ok:backup-model" }]);
    expect(response.modelTrace).toEqual({
      requestedModel: "ignored-model",
      selectedProviderId: "backup",
      selectedModel: "backup-model",
      fallbackUsed: true,
      attempts: [
        { providerId: "primary", model: "primary-model", attempt: 1, status: "failed", error: "failed primary-model" },
        { providerId: "primary", model: "primary-model", attempt: 2, status: "failed", error: "failed primary-model" },
        { providerId: "backup", model: "backup-model", attempt: 1, status: "success" },
      ],
    });
  });

  it("skips candidates that do not support the request capabilities", async () => {
    const textOnly = new StaticProvider("ok");
    const vision = new StaticProvider("ok");
    const registry = new ProviderRegistry();
    registry.register("text", textOnly, true, "text-model", {
      supportsTools: true,
      supportsVision: false,
      supportsThinking: false,
      supportsStreaming: true,
    });
    registry.register("vision", vision, false, "vision-model", {
      supportsTools: true,
      supportsVision: true,
      supportsThinking: false,
      supportsStreaming: true,
    });

    const provider = registry.resolve([
      { providerId: "text", model: "text-model" },
      { providerId: "vision", model: "vision-model" },
    ], "agent-vision", { fallbackCooldownMs: 60_000 });

    const response = await provider.chat({
      model: "text-model",
      systemPrompt: "system",
      messages: [{
        role: "user",
        content: [{ type: "image", source: { type: "url", url: "https://example.com/a.png" } }],
      }],
    });

    expect(textOnly.seenModels).toEqual([]);
    expect(vision.seenModels).toEqual(["vision-model"]);
    expect(response.modelTrace?.attempts).toEqual([
      { providerId: "text", model: "text-model", attempt: 0, status: "skipped", error: "model does not support image input" },
      { providerId: "vision", model: "vision-model", attempt: 1, status: "success" },
    ]);
  });
});
