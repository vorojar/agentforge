import type { Tool } from "@agentforge/types";

const mockWeatherData: Record<string, { temp_c: number; condition: string; humidity: number }> = {
  北京: { temp_c: 22, condition: "晴", humidity: 35 },
  上海: { temp_c: 26, condition: "多云", humidity: 65 },
  "San Francisco": { temp_c: 18, condition: "Foggy", humidity: 80 },
  Tokyo: { temp_c: 24, condition: "Sunny", humidity: 50 },
};

export const weatherTool: Tool = {
  name: "get_weather",
  description: "获取指定城市的当前天气信息",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "城市名称" },
      unit: {
        type: "string",
        enum: ["celsius", "fahrenheit"],
        description: "温度单位",
      },
    },
    required: ["city"],
  },
  async execute(input) {
    const city = input.city as string;
    const unit = (input.unit as string) ?? "celsius";

    const data = mockWeatherData[city] ?? { temp_c: 20, condition: "Unknown", humidity: 50 };

    const temp =
      unit === "fahrenheit" ? Math.round(data.temp_c * 9 / 5 + 32) : data.temp_c;
    const unitLabel = unit === "fahrenheit" ? "°F" : "°C";

    return {
      content: JSON.stringify({
        city,
        temperature: `${temp}${unitLabel}`,
        condition: data.condition,
        humidity: `${data.humidity}%`,
      }),
    };
  },
};
