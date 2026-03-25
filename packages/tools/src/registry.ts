import type { Tool, ToolDefinition, ToolRegistry } from "@agentforge/types";

export class ToolRegistryImpl implements ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  getDefinitions(): ToolDefinition[] {
    return [...this.tools.values()].map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));
  }

  getByNames(names: string[]): Tool[] {
    return names
      .map((name) => this.tools.get(name))
      .filter((tool): tool is Tool => tool !== undefined);
  }
}
