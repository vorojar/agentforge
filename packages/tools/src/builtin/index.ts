import type { Tool } from "@agentforge/types";
import { calculateTool } from "./calculate.js";
import { timeTool } from "./time.js";

export function createBuiltinTools(): Tool[] {
  return [calculateTool, timeTool];
}

export { calculateTool, timeTool };
