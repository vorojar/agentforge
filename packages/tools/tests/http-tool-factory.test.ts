import { describe, it, expect } from "vitest";
import { createHttpTools } from "../src/http-tool-factory.js";
import type { HttpTool } from "@agentforge/types";

function makeHttpTool(overrides: Partial<HttpTool> = {}): HttpTool {
  return {
    id: "ht-1",
    name: "test_api",
    description: "A test HTTP tool",
    method: "GET",
    url: "https://api.example.com/items/{itemId}",
    headers: { "X-Api-Key": "secret" },
    parameters: {
      type: "object",
      properties: { itemId: { type: "string" } },
      required: ["itemId"],
    },
    bodyTemplate: "",
    enabled: true,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("createHttpTools", () => {
  it("converts enabled HttpTool entries to runtime Tool objects", () => {
    const tools = createHttpTools([makeHttpTool()]);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("test_api");
    expect(tools[0].description).toBe("A test HTTP tool");
    expect(tools[0].parameters).toEqual({
      type: "object",
      properties: { itemId: { type: "string" } },
      required: ["itemId"],
    });
    expect(typeof tools[0].execute).toBe("function");
  });

  it("filters out disabled HttpTool entries", () => {
    const tools = createHttpTools([
      makeHttpTool({ name: "enabled_tool", enabled: true }),
      makeHttpTool({ name: "disabled_tool", enabled: false }),
    ]);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("enabled_tool");
  });

  it("returns empty array for empty input", () => {
    const tools = createHttpTools([]);
    expect(tools).toEqual([]);
  });

  it("converts multiple HttpTool entries", () => {
    const tools = createHttpTools([
      makeHttpTool({ name: "tool_a" }),
      makeHttpTool({ name: "tool_b" }),
    ]);
    expect(tools).toHaveLength(2);
    expect(tools.map(t => t.name)).toEqual(["tool_a", "tool_b"]);
  });
});
