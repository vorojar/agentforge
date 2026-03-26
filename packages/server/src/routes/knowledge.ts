import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";
import { chunkText } from "@agentforge/tools/chunker";
import type { EmbeddingClient } from "@agentforge/tools";

export async function knowledgeRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db } = opts.ctx;
  const embedder = opts.ctx.embedder;

  // Upload knowledge file (text content in body)
  fastify.post("/api/agents/:id/knowledge", async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = db.getAgent(id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    const body = request.body as { name: string; content: string };
    if (!body.name || !body.content) return reply.code(400).send({ error: "name and content are required" });

    const chunks = chunkText(body.content);

    // Generate embeddings if available
    let embeddings: number[][] | undefined;
    if (embedder) {
      try {
        // Batch in groups of 10 to avoid rate limits
        embeddings = [];
        for (let i = 0; i < chunks.length; i += 10) {
          const batch = chunks.slice(i, i + 10);
          const batchEmbs = await embedder.embed(batch);
          embeddings.push(...batchEmbs);
        }
        request.log.info(`Embedded ${chunks.length} chunks for ${body.name}`);
      } catch (error) {
        request.log.warn(error, "Embedding failed, storing without vectors");
        embeddings = undefined;
      }
    }

    const count = db.ingestKnowledge(id, body.name, chunks, embeddings);
    return { sourceName: body.name, chunks: count, embedded: !!embeddings };
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

    let queryEmbedding: number[] | undefined;
    if (embedder) {
      try {
        const [emb] = await embedder.embed([body.query]);
        queryEmbedding = emb;
      } catch { /* fallback to keyword search */ }
    }

    return db.searchKnowledge(id, body.query, body.limit, queryEmbedding);
  });

  // Delete knowledge source
  fastify.delete("/api/agents/:id/knowledge/:sourceName", async (request, reply) => {
    const { id, sourceName } = request.params as { id: string; sourceName: string };
    const deleted = db.deleteKnowledgeSource(id, decodeURIComponent(sourceName));
    if (!deleted) return reply.code(404).send({ error: "Knowledge source not found" });
    return { success: true };
  });
}
