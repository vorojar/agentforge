/**
 * tools.ts — 工具定义与执行器
 *
 * Claude Agent SDK 的工具系统由两部分组成：
 * 1. 工具定义（Tool）：告诉 Claude 有哪些工具可用、参数格式
 * 2. 工具执行器（ToolExecutor）：实际执行工具调用并返回结果
 */

import Anthropic from "@anthropic-ai/sdk";

// ============================================================
// 工具定义 — 遵循 JSON Schema 格式
// ============================================================

export const tools: Anthropic.Tool[] = [
  {
    name: "get_weather",
    description: "获取指定城市的当前天气信息",
    input_schema: {
      type: "object" as const,
      properties: {
        city: {
          type: "string",
          description: "城市名称，例如 '北京'、'San Francisco'",
        },
        unit: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          description: "温度单位，默认摄氏度",
        },
      },
      required: ["city"],
    },
  },
  {
    name: "calculate",
    description: "执行数学计算，支持基本四则运算和常用数学函数",
    input_schema: {
      type: "object" as const,
      properties: {
        expression: {
          type: "string",
          description: "数学表达式，例如 '2 + 3 * 4' 或 'Math.sqrt(144)'",
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "get_time",
    description: "获取指定时区的当前时间",
    input_schema: {
      type: "object" as const,
      properties: {
        timezone: {
          type: "string",
          description: "IANA 时区名称，例如 'Asia/Shanghai'、'America/New_York'",
        },
      },
      required: ["timezone"],
    },
  },
];

// ============================================================
// 工具执行器 — 根据工具名称分发到具体实现
// ============================================================

/** 工具执行结果 */
interface ToolResult {
  success: boolean;
  data: string;
}

/** 模拟天气数据（实际项目中替换为真实 API 调用） */
function getWeather(city: string, unit = "celsius"): ToolResult {
  const mockData: Record<string, { temp: number; condition: string }> = {
    北京: { temp: 22, condition: "晴" },
    上海: { temp: 25, condition: "多云" },
    "San Francisco": { temp: 18, condition: "Foggy" },
    Tokyo: { temp: 20, condition: "Cloudy" },
  };

  const data = mockData[city];
  if (!data) {
    return { success: true, data: `${city}: 24°C, 晴（模拟数据）` };
  }

  const temp =
    unit === "fahrenheit" ? Math.round(data.temp * 1.8 + 32) : data.temp;
  const symbol = unit === "fahrenheit" ? "°F" : "°C";
  return {
    success: true,
    data: `${city}: ${temp}${symbol}, ${data.condition}`,
  };
}

/** 安全的数学计算（使用 Function 构造器而非 eval） */
function calculate(expression: string): ToolResult {
  try {
    // 白名单：只允许数字、运算符、Math 方法和括号
    if (!/^[\d\s+\-*/().,%Math.sqrtpowabsceilfloorround,PI,E,log,sin,cos,tan]+$/.test(expression)) {
      return { success: false, data: `不安全的表达式: ${expression}` };
    }
    const result = new Function(`"use strict"; return (${expression})`)();
    return { success: true, data: `${expression} = ${result}` };
  } catch (e) {
    return { success: false, data: `计算错误: ${(e as Error).message}` };
  }
}

/** 获取指定时区的当前时间 */
function getTime(timezone: string): ToolResult {
  try {
    const time = new Date().toLocaleString("zh-CN", { timeZone: timezone });
    return { success: true, data: `${timezone}: ${time}` };
  } catch {
    return { success: false, data: `无效时区: ${timezone}` };
  }
}

/**
 * 工具分发器 — Agent 循环中调用此函数执行工具
 *
 * @param name  工具名称（与 tools 定义中的 name 对应）
 * @param input 工具参数（Claude 生成的 JSON 对象）
 */
export function executeTool(
  name: string,
  input: Record<string, unknown>
): string {
  let result: ToolResult;

  switch (name) {
    case "get_weather":
      result = getWeather(
        input.city as string,
        (input.unit as string) ?? "celsius"
      );
      break;
    case "calculate":
      result = calculate(input.expression as string);
      break;
    case "get_time":
      result = getTime(input.timezone as string);
      break;
    default:
      result = { success: false, data: `未知工具: ${name}` };
  }

  return result.data;
}
