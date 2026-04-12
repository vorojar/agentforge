/**
 * 知识库搜索工具
 * 功能：搜索 Agent 关联的多个知识库
 * 创建时间：2026-03-31
 * 负责人：王觉贤
 */

import type { Tool, DatabaseAdapter } from "@agentforge/types";
import type { EmbeddingClient } from "../embedding.js";

export function createKnowledgeSearchTool(db: DatabaseAdapter, embedder?: EmbeddingClient): Tool {
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

      const query = (input.query as string) || "";
      if (!query.trim()) return { content: "Please provide a search query." };

      const kbIds = await db.getAgentKnowledge(agentId);
      if (kbIds.length === 0) {
        return { content: "No knowledge bases associated with this agent." };
      }

      let queryEmbedding: number[] | undefined;
      if (embedder) {
        try {
          const [emb] = await embedder.embed([query]);
          queryEmbedding = emb;
        } catch { /* fallback to keyword search */ }
      }

      const results = await db.searchKnowledge(kbIds, query, 5, queryEmbedding);
      if (results.length === 0) {
        return { content: "No relevant documents found in knowledge base." };
      }

      const formatted = results.map((r, i) => {
        const kbLabel = r.kbName ? `${r.kbName} / ${r.sourceName}` : r.sourceName;
        return `[${i + 1}] (${kbLabel}, relevance: ${(r.score * 100).toFixed(0)}%)\n${r.content}`;
      }).join("\n\n---\n\n");

      return { content: formatted.slice(0, 6000) };
    },
  };
}
