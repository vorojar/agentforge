import type { Tool, HttpTool } from "@agentforge/types";

export function createHttpTools(httpTools: HttpTool[]): Tool[] {
  return httpTools.filter(t => t.enabled).map(httpToolToTool);
}

/**
 * 对字符串值进行 JSON 安全转义，确保嵌入 JSON 字符串字面量后不会破坏 JSON 结构。
 * 利用 JSON.stringify 生成合法的 JSON 字符串表示，然后去掉首尾引号。
 */
export function escapeJsonStringValue(val: string): string {
  return JSON.stringify(val).slice(1, -1);
}

/**
 * 判断占位符是否处于 JSON 字符串值的上下文中（即被双引号包围），
 * 以决定是否需要对替换值进行 JSON 转义。
 */
export function isPlaceholderInJsonString(template: string, placeholder: string): boolean {
  const idx = template.indexOf(placeholder);
  if (idx < 0) return false;
  const before = template.substring(0, idx);
  const after = template.substring(idx + placeholder.length);
  const hasQuoteBefore = before.trimEnd().endsWith('"');
  const hasQuoteAfter = after.trimStart().startsWith('"');
  return hasQuoteBefore && hasQuoteAfter;
}

function httpToolToTool(ht: HttpTool): Tool {
  return {
    name: ht.name,
    description: ht.description,
    parameters: ht.parameters,
    async execute(input) {
      let url = ht.url;
      let body = ht.bodyTemplate;
      for (const [key, value] of Object.entries(input)) {
        const placeholder = `{${key}}`;
        url = url.replaceAll(placeholder, String(value));
        if (body) {
          const strVal = String(value);
          const escaped = isPlaceholderInJsonString(body, placeholder)
            ? escapeJsonStringValue(strVal)
            : strVal;
          body = body.replaceAll(placeholder, escaped);
        }
      }

      const options: RequestInit = {
        method: ht.method,
        headers: { ...ht.headers, "Content-Type": "application/json" },
      };
      if (["POST", "PUT", "PATCH"].includes(ht.method.toUpperCase()) && body) {
        options.body = body;
      }

      try {
        const response = await fetch(url, options);
        const text = await response.text();
        if (!response.ok) {
          return { content: `HTTP ${response.status}: ${text}`, isError: true };
        }
        return { content: text };
      } catch (error) {
        return { content: `Request failed: ${(error as Error).message}`, isError: true };
      }
    },
  };
}
