import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistryImpl } from "../src/registry.js";
import { ToolExecutor } from "../src/executor.js";
import type { Tool, ToolHook, ToolPolicy } from "@agentforge/types";

function makeTool(name: string, fn?: (input: Record<string, unknown>) => string): Tool {
  return {
    name,
    description: `Tool ${name}`,
    parameters: { type: "object", properties: {}, required: [] },
    async execute(input) {
      return { content: fn ? fn(input) : name };
    },
  };
}

describe("ToolExecutor", () => {
  let registry: ToolRegistryImpl;

  beforeEach(() => {
    registry = new ToolRegistryImpl();
  });

  it("executes a registered tool", async () => {
    registry.register(makeTool("echo", (input) => String(input.msg)));
    const executor = new ToolExecutor(registry);
    const result = await executor.execute("echo", { msg: "hello" });
    expect(result).toEqual({ content: "hello" });
  });

  it("returns error for unknown tool", async () => {
    const executor = new ToolExecutor(registry);
    const result = await executor.execute("missing", {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
  });

  it("before hook modifies input", async () => {
    registry.register(makeTool("greet", (input) => `hi ${input.name}`));
    const hook: ToolHook = {
      async before(_name, input) {
        return { ...input, name: "world" };
      },
    };
    const executor = new ToolExecutor(registry, [hook]);
    const result = await executor.execute("greet", { name: "nobody" });
    expect(result.content).toBe("hi world");
  });

  it("before hook blocks execution by returning null", async () => {
    registry.register(makeTool("blocked"));
    const hook: ToolHook = {
      async before() {
        return null;
      },
    };
    const executor = new ToolExecutor(registry, [hook]);
    const result = await executor.execute("blocked", {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("blocked by hook");
  });

  it("after hook modifies result", async () => {
    registry.register(makeTool("data"));
    const hook: ToolHook = {
      async after(_name, _input, result) {
        return { content: result.content + " (modified)" };
      },
    };
    const executor = new ToolExecutor(registry, [hook]);
    const result = await executor.execute("data", {});
    expect(result.content).toBe("data (modified)");
  });

  it("policy allow blocks unlisted tool", async () => {
    registry.register(makeTool("secret"));
    const policy: ToolPolicy = { allow: ["safe"] };
    const executor = new ToolExecutor(registry, [], policy);
    const result = await executor.execute("secret", {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not allowed");
  });

  it("policy deny blocks listed tool", async () => {
    registry.register(makeTool("dangerous"));
    const policy: ToolPolicy = { deny: ["dangerous"] };
    const executor = new ToolExecutor(registry, [], policy);
    const result = await executor.execute("dangerous", {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("denied");
  });
});
