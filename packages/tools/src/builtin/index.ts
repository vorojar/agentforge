import type { Tool } from "@agentforge/types";
import { weatherTool } from "./weather.js";
import { calculateTool } from "./calculate.js";
import { timeTool } from "./time.js";

export function createBuiltinTools(): Tool[] {
  return [weatherTool, calculateTool, timeTool];
}

export { weatherTool, calculateTool, timeTool };
