import type { Tool, HttpTool } from "@agentforge/types";

export function createHttpTools(httpTools: HttpTool[]): Tool[] {
  return httpTools.filter(t => t.enabled).map(httpToolToTool);
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
        if (body) body = body.replaceAll(placeholder, String(value));
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
