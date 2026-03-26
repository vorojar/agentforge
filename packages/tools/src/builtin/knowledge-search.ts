import type { Tool, DatabaseAdapter } from "@agentforge/types";

export function createKnowledgeSearchTool(db: DatabaseAdapter): Tool {
  return {
    name: "search_knowledge",
    description: "Search the agent's knowledge base (uploaded documents) for relevant information. Use this when the user asks about topics that might be covered in uploaded documents.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query — use keywords relevant to the question",
        },
      },
      required: ["query"],
    },
    async execute(input, context) {
      const agentId = context?.agentId;
      if (!agentId) return { content: "No agent context available", isError: true };

      const results = db.searchKnowledge(agentId, input.query as string, 5);
      if (results.length === 0) {
        return { content: "No relevant documents found in knowledge base." };
      }

      const formatted = results.map((r, i) =>
        `[${i + 1}] (${r.sourceName}, relevance: ${(r.score * 100).toFixed(0)}%)\n${r.content}`
      ).join("\n\n---\n\n");

      return { content: formatted.slice(0, 6000) };
    },
  };
}
