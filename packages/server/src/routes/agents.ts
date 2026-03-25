import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";

export async function agentRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db } = opts.ctx;

  // Create agent
  fastify.post("/api/agents", async (request, reply) => {
    const body = request.body as {
      name: string;
      description?: string;
      systemPrompt: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      maxIterations?: number;
      streaming?: boolean;
      tools?: string[];
      skills?: string[];
    };

    if (!body.name || !body.systemPrompt) {
      return reply.code(400).send({ error: "name and systemPrompt are required" });
    }

    if (!body.model) {
      body.model = opts.ctx.config.defaultModel;
    }
    const agent = db.createAgent(body);
    const { apiKey, rawKey } = db.createApiKey(agent.id, "default");

    return reply.code(201).send({
      ...agent,
      apiKeys: [{ ...apiKey, rawKey }],
    });
  });

  // List agents
  fastify.get("/api/agents", async () => {
    const agents = db.listAgents();
    return agents.map((agent) => {
      const keys = db.listApiKeys(agent.id);
      return {
        ...agent,
        apiKeys: keys.map((k) => ({ id: k.id, keyPrefix: k.keyPrefix, name: k.name, enabled: k.enabled, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt })),
      };
    });
  });

  // Get single agent
  fastify.get("/api/agents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = db.getAgent(id);
    if (!agent) {
      return reply.code(404).send({ error: "Agent not found" });
    }
    const keys = db.listApiKeys(id);
    return { ...agent, apiKeys: keys };
  });

  // Update agent
  fastify.put("/api/agents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const updated = db.updateAgent(id, body);
    if (!updated) {
      return reply.code(404).send({ error: "Agent not found" });
    }
    return updated;
  });

  // Delete agent
  fastify.delete("/api/agents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = db.deleteAgent(id);
    if (!deleted) {
      return reply.code(404).send({ error: "Agent not found" });
    }
    return { success: true };
  });

  // Generate new API key
  fastify.post("/api/agents/:id/keys", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as { name?: string }) ?? {};
    const agent = db.getAgent(id);
    if (!agent) {
      return reply.code(404).send({ error: "Agent not found" });
    }
    const { apiKey, rawKey } = db.createApiKey(id, body.name);
    return reply.code(201).send({ ...apiKey, rawKey });
  });

  // Revoke API key
  fastify.delete("/api/agents/:id/keys/:keyId", async (request, reply) => {
    const { keyId } = request.params as { id: string; keyId: string };
    const deleted = db.deleteApiKey(keyId);
    if (!deleted) {
      return reply.code(404).send({ error: "API key not found" });
    }
    return { success: true };
  });
}
