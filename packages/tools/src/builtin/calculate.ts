import type { Tool } from "@agentforge/types";

const SAFE_EXPRESSION = /^[\d\s+\-*/().%]+$/;

export const calculateTool: Tool = {
  name: "calculate",
  description: "计算数学表达式",
  parameters: {
    type: "object",
    properties: {
      expression: { type: "string", description: "数学表达式，如 2 + 3 * 4" },
    },
    required: ["expression"],
  },
  async execute(input) {
    const expression = input.expression as string;

    if (!SAFE_EXPRESSION.test(expression)) {
      return { content: "Invalid expression: only numbers and +, -, *, /, %, (, ) are allowed", isError: true };
    }

    try {
      const fn = new Function(`"use strict"; return (${expression});`);
      const result = fn() as number;

      if (!Number.isFinite(result)) {
        return { content: "Calculation resulted in Infinity or NaN", isError: true };
      }

      return { content: JSON.stringify({ expression, result }) };
    } catch {
      return { content: `Failed to evaluate expression: ${expression}`, isError: true };
    }
  },
};
