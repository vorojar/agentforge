import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";
import { pipeStreamToSSE } from "../sse.js";
import type { ImageBlock } from "@agentforge/types";
import { resolveWorkspaceId } from "../workspace.js";

export async function agentRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db, agentLoop } = opts.ctx;

  fastify.post("/api/agents", async (request, reply) => {
    const body = request.body as {
      name: string;
      description?: string;
      systemPrompt: string;
      providerId?: string;
      model?: string;
      fallbackModels?: Array<{ providerId?: string; model: string }>;
      fallbackCooldownSeconds?: number;
      temperature?: number;
      maxTokens?: number;
      maxIterations?: number;
      streaming?: boolean;
      thinking?: boolean;
      tools?: string[];
      skills?: string[];
      category?: string;
    };

    if (!body.name || !body.systemPrompt) {
      return reply.code(400).send({ error: "name and systemPrompt are required" });
    }

    if (!body.model) {
      body.model = opts.ctx.config.defaultModel;
    }
    const workspaceId = await resolveWorkspaceId(request, db);
    const agent = await db.createAgent({ ...body, workspaceId });
    const { apiKey, rawKey } = await db.createApiKey(agent.id, "default");

    return reply.code(201).send({
      ...agent,
      apiKeys: [{ ...apiKey, rawKey }],
    });
  });

  fastify.get("/api/agents", async (request) => {
    const workspaceId = await resolveWorkspaceId(request, db);
    const agents = await db.listAgents(workspaceId);
    const result = [];
    for (const agent of agents) {
      const keys = await db.listApiKeys(agent.id);
      result.push({
        ...agent,
        apiKeys: keys.map((k) => ({ id: k.id, keyPrefix: k.keyPrefix, name: k.name, enabled: k.enabled, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt })),
      });
    }
    return result;
  });

  fastify.get("/api/agents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const agent = await db.getAgent(id);
    if (!agent || agent.workspaceId !== workspaceId) {
      return reply.code(404).send({ error: "Agent not found" });
    }
    const keys = await db.listApiKeys(id);
    return { ...agent, apiKeys: keys };
  });

  fastify.put("/api/agents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const agent = await db.getAgent(id);
    if (!agent || agent.workspaceId !== workspaceId) return reply.code(404).send({ error: "Agent not found" });
    const body = request.body as Record<string, unknown>;
    const updated = await db.updateAgent(id, body);
    if (!updated) {
      return reply.code(404).send({ error: "Agent not found" });
    }
    return updated;
  });

  fastify.delete("/api/agents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const agent = await db.getAgent(id);
    if (!agent || agent.workspaceId !== workspaceId) return reply.code(404).send({ error: "Agent not found" });
    const deleted = await db.deleteAgent(id);
    if (!deleted) {
      return reply.code(404).send({ error: "Agent not found" });
    }
    return { success: true };
  });

  fastify.post("/api/agents/:id/keys", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as { name?: string }) ?? {};
    const workspaceId = await resolveWorkspaceId(request, db);
    const agent = await db.getAgent(id);
    if (!agent || agent.workspaceId !== workspaceId) {
      return reply.code(404).send({ error: "Agent not found" });
    }
    const { apiKey, rawKey } = await db.createApiKey(id, body.name);
    return reply.code(201).send({ ...apiKey, rawKey });
  });

  fastify.delete("/api/agents/:id/keys/:keyId", async (request, reply) => {
    const { keyId } = request.params as { id: string; keyId: string };
    const deleted = await db.deleteApiKey(keyId);
    if (!deleted) {
      return reply.code(404).send({ error: "API key not found" });
    }
    return { success: true };
  });

  fastify.post("/api/agents/:id/chat", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const agent = await db.getAgent(id);
    if (!agent || agent.workspaceId !== workspaceId) return reply.code(404).send({ error: "Agent not found" });

    const body = request.body as { message: string; sessionId?: string; images?: Array<{ type: "base64"; data: string; mediaType: string } | { type: "url"; url: string }> };
    if (!body.message && !body.images?.length) return reply.code(400).send({ error: "message or images is required" });

    const imageBlocks: ImageBlock[] | undefined = body.images?.map(img => ({ type: "image" as const, source: img }));

    try {
      const result = await agentLoop.run(agent, body.message ?? "", body.sessionId, imageBlocks);
      return { reply: result.reply, thinking: result.thinking, systemPrompt: result.systemPrompt, sessionId: result.sessionId, toolCalls: result.toolCalls, usage: result.usage };
    } catch (error) {
      request.log.error(error, "Test chat request failed");
      return reply.code(502).send({ error: "LLM provider error", message: (error as Error).message });
    }
  });

  fastify.post("/api/agents/:id/chat/stream", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const agent = await db.getAgent(id);
    if (!agent || agent.workspaceId !== workspaceId) return reply.code(404).send({ error: "Agent not found" });

    const body = request.body as { message: string; sessionId?: string; images?: Array<{ type: "base64"; data: string; mediaType: string } | { type: "url"; url: string }> };
    if (!body.message && !body.images?.length) return reply.code(400).send({ error: "message or images is required" });

    const imageBlocks: ImageBlock[] | undefined = body.images?.map(img => ({ type: "image" as const, source: img }));

    await pipeStreamToSSE(reply, agentLoop.runStream(agent, body.message ?? "", body.sessionId, imageBlocks), request.log);
  });
}
