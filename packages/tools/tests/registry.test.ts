import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistryImpl } from "../src/registry.js";
import type { Tool } from "@agentforge/types";

function makeTool(name: string): Tool {
  return {
    name,
    description: `Tool ${name}`,
    parameters: { type: "object", properties: {}, required: [] },
    async execute() {
      return { content: name };
    },
  };
}

describe("ToolRegistryImpl", () => {
  let registry: ToolRegistryImpl;

  beforeEach(() => {
    registry = new ToolRegistryImpl();
  });

  it("registers and gets a tool", () => {
    const tool = makeTool("foo");
    registry.register(tool);
    expect(registry.get("foo")).toBe(tool);
  });

  it("returns undefined for unknown tool", () => {
    expect(registry.get("nope")).toBeUndefined();
  });

  it("lists all registered tools", () => {
    registry.register(makeTool("a"));
    registry.register(makeTool("b"));
    expect(registry.list()).toHaveLength(2);
  });

  it("throws on duplicate registration", () => {
    registry.register(makeTool("dup"));
    expect(() => registry.register(makeTool("dup"))).toThrow(
      'Tool "dup" is already registered'
    );
  });

  it("returns definitions without execute", () => {
    registry.register(makeTool("x"));
    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0]).toEqual({
      name: "x",
      description: "Tool x",
      parameters: { type: "object", properties: {}, required: [] },
    });
    expect(defs[0]).not.toHaveProperty("execute");
  });

  it("gets tools by names", () => {
    registry.register(makeTool("a"));
    registry.register(makeTool("b"));
    registry.register(makeTool("c"));
    const result = registry.getByNames(["a", "c", "missing"]);
    expect(result.map((t) => t.name)).toEqual(["a", "c"]);
  });
});
