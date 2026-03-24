import type {
  ToolRegistry,
  ToolHook,
  ToolPolicy,
  ToolResult,
  ToolExecutionContext,
} from "@agentforge/types";

export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private hooks?: ToolHook[],
    private policy?: ToolPolicy
  ) {}

  async execute(
    toolName: string,
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    // 1. Check policy
    if (this.policy?.allow && !this.policy.allow.includes(toolName)) {
      return { content: `Tool "${toolName}" is not allowed by policy`, isError: true };
    }
    if (this.policy?.deny && this.policy.deny.includes(toolName)) {
      return { content: `Tool "${toolName}" is denied by policy`, isError: true };
    }

    // 2. Run before hooks
    let currentInput = input;
    if (this.hooks) {
      for (const hook of this.hooks) {
        if (hook.before) {
          const result = await hook.before(toolName, currentInput);
          if (result === null) {
            return { content: `Execution of "${toolName}" blocked by hook`, isError: true };
          }
          currentInput = result;
        }
      }
    }

    // 3. Get tool from registry
    const tool = this.registry.get(toolName);
    if (!tool) {
      return { content: `Tool "${toolName}" not found`, isError: true };
    }

    // 4. Execute tool
    let currentResult = await tool.execute(currentInput, context);

    // 5. Run after hooks
    if (this.hooks) {
      for (const hook of this.hooks) {
        if (hook.after) {
          currentResult = await hook.after(toolName, currentInput, currentResult);
        }
      }
    }

    // 6. Return final result
    return currentResult;
  }
}
