import type { Tool } from "@agentforge/types";

export const timeTool: Tool = {
  name: "get_time",
  description: "获取指定时区的当前时间",
  parameters: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "IANA 时区名称，如 Asia/Shanghai, America/New_York",
      },
    },
    required: ["timezone"],
  },
  async execute(input) {
    const timezone = input.timezone as string;

    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const now = new Date();
      const formatted = formatter.format(now);

      return {
        content: JSON.stringify({ timezone, datetime: formatted }),
      };
    } catch {
      return { content: `Invalid timezone: ${timezone}`, isError: true };
    }
  },
};
