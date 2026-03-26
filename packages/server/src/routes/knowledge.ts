import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";
import { chunkText } from "@agentforge/tools/chunker";

export async function knowledgeRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db } = opts.ctx;

  // Upload knowledge file (text content in body)
  fastify.post("/api/agents/:id/knowledge", async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = db.getAgent(id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    const body = request.body as { name: string; content: string };
    if (!body.name || !body.content) return reply.code(400).send({ error: "name and content are required" });

    const chunks = chunkText(body.content);
    const count = db.ingestKnowledge(id, body.name, chunks);
    return { sourceName: body.name, chunks: count };
  });

  // List knowledge sources for agent
  fastify.get("/api/agents/:id/knowledge", async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = db.getAgent(id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    return db.listKnowledgeSources(id);
  });

  // Search knowledge
  fastify.post("/api/agents/:id/knowledge/search", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { query: string; limit?: number };
    if (!body.query) return reply.code(400).send({ error: "query is required" });
    return db.searchKnowledge(id, body.query, body.limit);
  });

  // Delete knowledge source
  fastify.delete("/api/agents/:id/knowledge/:sourceName", async (request, reply) => {
    const { id, sourceName } = request.params as { id: string; sourceName: string };
    const deleted = db.deleteKnowledgeSource(id, decodeURIComponent(sourceName));
    if (!deleted) return reply.code(404).send({ error: "Knowledge source not found" });
    return { success: true };
  });
}
