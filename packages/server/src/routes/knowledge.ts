/**
 * 知识库路由
 * 功能：独立知识库 CRUD、知识源管理、Agent-知识库关联、搜索
 * 创建时间：2026-03-31
 * 负责人：王觉贤
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";
import { chunkText } from "@agentforge/tools/chunker";

export async function knowledgeRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db } = opts.ctx;
  const embedder = opts.ctx.embedder;

  async function embedChunks(chunks: string[], logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void }, label: string): Promise<number[][] | undefined> {
    if (!embedder) return undefined;
    try {
      const embeddings: number[][] = [];
      for (let i = 0; i < chunks.length; i += 10) {
        const batch = chunks.slice(i, i + 10);
        const batchEmbs = await embedder.embed(batch);
        embeddings.push(...batchEmbs);
      }
      logger.info(`Embedded ${chunks.length} chunks for ${label}`);
      return embeddings;
    } catch (error) {
      logger.warn(error, "Embedding failed, storing without vectors");
      return undefined;
    }
  }

  // --- Knowledge Base CRUD ---

  fastify.post("/api/knowledge-bases", async (request, reply) => {
    const body = request.body as { name: string; description?: string };
    if (!body.name) return reply.code(400).send({ error: "name is required" });
    const kb = await db.createKnowledgeBase(body);
    return reply.code(201).send(kb);
  });

  fastify.get("/api/knowledge-bases", async () => {
    const kbs = await db.listKnowledgeBases();
    const result = [];
    for (const kb of kbs) {
      const sources = await db.listKnowledgeSources(kb.id);
      result.push({ ...kb, sources });
    }
    return result;
  });

  fastify.get("/api/knowledge-bases/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const kb = await db.getKnowledgeBase(id);
    if (!kb) return reply.code(404).send({ error: "Knowledge base not found" });
    const sources = await db.listKnowledgeSources(kb.id);
    return { ...kb, sources };
  });

  fastify.put("/api/knowledge-bases/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; description?: string };
    const updated = await db.updateKnowledgeBase(id, body);
    if (!updated) return reply.code(404).send({ error: "Knowledge base not found" });
    return updated;
  });

  fastify.delete("/api/knowledge-bases/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await db.deleteKnowledgeBase(id);
    if (!deleted) return reply.code(404).send({ error: "Knowledge base not found" });
    return { success: true };
  });

  // --- Knowledge Sources within a Knowledge Base ---

  fastify.post("/api/knowledge-bases/:id/sources", async (request, reply) => {
    const { id } = request.params as { id: string };
    const kb = await db.getKnowledgeBase(id);
    if (!kb) return reply.code(404).send({ error: "Knowledge base not found" });

    const body = request.body as { name: string; content: string };
    if (!body.name || !body.content) return reply.code(400).send({ error: "name and content are required" });

    const chunks = chunkText(body.content);
    const embeddings = await embedChunks(chunks, request.log, body.name);
    const count = await db.ingestKnowledge(id, body.name, body.content, chunks, embeddings);
    return { sourceName: body.name, chunks: count, embedded: !!embeddings };
  });

  fastify.get("/api/knowledge-bases/:id/sources", async (request, reply) => {
    const { id } = request.params as { id: string };
    const kb = await db.getKnowledgeBase(id);
    if (!kb) return reply.code(404).send({ error: "Knowledge base not found" });
    return await db.listKnowledgeSources(id);
  });

  fastify.get("/api/knowledge-bases/:id/sources/:sourceName/content", async (request, reply) => {
    const { id, sourceName } = request.params as { id: string; sourceName: string };
    const content = await db.getKnowledgeSourceContent(id, decodeURIComponent(sourceName));
    if (content === null) return reply.code(404).send({ error: "Knowledge source not found" });
    return { sourceName: decodeURIComponent(sourceName), content };
  });

  fastify.put("/api/knowledge-bases/:id/sources/:sourceName/content", async (request, reply) => {
    const { id, sourceName } = request.params as { id: string; sourceName: string };
    const kb = await db.getKnowledgeBase(id);
    if (!kb) return reply.code(404).send({ error: "Knowledge base not found" });

    const body = request.body as { content: string };
    if (body.content === undefined) return reply.code(400).send({ error: "content is required" });

    const decoded = decodeURIComponent(sourceName);
    const chunks = chunkText(body.content);
    const embeddings = await embedChunks(chunks, request.log, decoded);
    const count = await db.ingestKnowledge(id, decoded, body.content, chunks, embeddings);
    return { sourceName: decoded, chunks: count, embedded: !!embeddings };
  });

  fastify.patch("/api/knowledge-bases/:id/sources/:sourceName", async (request, reply) => {
    const { id, sourceName } = request.params as { id: string; sourceName: string };
    const body = request.body as { newName: string };
    if (!body.newName?.trim()) return reply.code(400).send({ error: "newName is required" });
    const renamed = await db.renameKnowledgeSource(id, decodeURIComponent(sourceName), body.newName.trim());
    if (!renamed) return reply.code(404).send({ error: "Knowledge source not found" });
    return { success: true };
  });

  fastify.delete("/api/knowledge-bases/:id/sources/:sourceName", async (request, reply) => {
    const { id, sourceName } = request.params as { id: string; sourceName: string };
    const deleted = await db.deleteKnowledgeSource(id, decodeURIComponent(sourceName));
    if (!deleted) return reply.code(404).send({ error: "Knowledge source not found" });
    return { success: true };
  });

  // --- Search across knowledge bases ---

  fastify.post("/api/knowledge-bases/search", async (request, reply) => {
    const body = request.body as { kbIds: string[]; query: string; limit?: number };
    if (!body.query || !body.kbIds?.length) return reply.code(400).send({ error: "query and kbIds are required" });

    let queryEmbedding: number[] | undefined;
    if (embedder) {
      try {
        const [emb] = await embedder.embed([body.query]);
        queryEmbedding = emb;
      } catch { /* fallback to keyword search */ }
    }

    return await db.searchKnowledge(body.kbIds, body.query, body.limit, queryEmbedding);
  });

  // --- Agent-Knowledge Association ---

  fastify.put("/api/agents/:agentId/knowledge", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const agent = await db.getAgent(agentId);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    const body = request.body as { kbIds: string[] };
    await db.setAgentKnowledge(agentId, body.kbIds ?? []);
    return { success: true, kbIds: body.kbIds };
  });

  fastify.get("/api/agents/:agentId/knowledge", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const agent = await db.getAgent(agentId);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    const kbIds = await db.getAgentKnowledge(agentId);
    return { kbIds };
  });

  // --- Legacy compatible: upload to agent (auto-create default KB) ---

  fastify.post("/api/agents/:id/knowledge/upload", async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = await db.getAgent(id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    const body = request.body as { name: string; content: string };
    if (!body.name || !body.content) return reply.code(400).send({ error: "name and content are required" });

    let kbIds = await db.getAgentKnowledge(id);
    let kbId: string;
    if (kbIds.length > 0) {
      kbId = kbIds[0];
    } else {
      const kb = await db.createKnowledgeBase({ name: `${agent.name} - 默认知识库` });
      kbId = kb.id;
      await db.setAgentKnowledge(id, [kbId]);
    }

    const chunks = chunkText(body.content);
    const embeddings = await embedChunks(chunks, request.log, body.name);
    const count = await db.ingestKnowledge(kbId, body.name, body.content, chunks, embeddings);
    return { sourceName: body.name, chunks: count, embedded: !!embeddings };
  });
}
