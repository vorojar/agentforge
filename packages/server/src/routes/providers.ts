import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";

export async function providerRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db, providerRegistry } = opts.ctx;

  fastify.post("/api/providers", async (request, reply) => {
    const body = request.body as {
      name: string; type: string; apiKey: string;
      baseUrl?: string; defaultModel: string; isPrimary?: boolean;
    };
    if (!body.name || !body.type || !body.apiKey || !body.defaultModel) {
      return reply.code(400).send({ error: "name, type, apiKey, and defaultModel are required" });
    }
    const provider = await db.createProvider(body);
    await providerRegistry.reload(db);
    return reply.code(201).send(provider);
  });

  fastify.get("/api/providers", async () => {
    const list = await db.listProviders();
    return list.map(p => ({ ...p, apiKey: maskKey(p.apiKey) }));
  });

  fastify.get("/api/providers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const provider = await db.getProvider(id);
    if (!provider) return reply.code(404).send({ error: "Provider not found" });
    return { ...provider, apiKey: maskKey(provider.apiKey) };
  });

  fastify.put("/api/providers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const updated = await db.updateProvider(id, body);
    if (!updated) return reply.code(404).send({ error: "Provider not found" });
    await providerRegistry.reload(db);
    return { ...updated, apiKey: maskKey(updated.apiKey) };
  });

  fastify.delete("/api/providers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await db.deleteProvider(id);
    if (!deleted) return reply.code(404).send({ error: "Provider not found" });
    await providerRegistry.reload(db);
    return { success: true };
  });

  // --- Provider Channels ---

  fastify.post("/api/providers/:id/channels", async (request, reply) => {
    const { id } = request.params as { id: string };
    const provider = await db.getProvider(id);
    if (!provider) return reply.code(404).send({ error: "Provider not found" });

    const body = request.body as { name: string };
    if (!body.name) return reply.code(400).send({ error: "name is required" });

    const { channel, rawKey } = await db.createChannel(id, body.name);
    return reply.code(201).send({ ...channel, rawKey });
  });

  fastify.get("/api/providers/:id/channels", async (request, reply) => {
    const { id } = request.params as { id: string };
    const provider = await db.getProvider(id);
    if (!provider) return reply.code(404).send({ error: "Provider not found" });

    const channels = await db.listChannels(id);
    return channels;
  });

  fastify.delete("/api/providers/:providerId/channels/:channelId", async (request, reply) => {
    const { channelId } = request.params as { providerId: string; channelId: string };
    const deleted = await db.deleteChannel(channelId);
    if (!deleted) return reply.code(404).send({ error: "Channel not found" });
    return { success: true };
  });

  fastify.get("/api/providers/:id/channels/stats", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    const provider = await db.getProvider(id);
    if (!provider) return reply.code(404).send({ error: "Provider not found" });
    return await db.getProviderChannelStats(id, startDate, endDate);
  });

  fastify.get("/api/channels/:channelId/stats", async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    const { days } = request.query as { days?: string };
    return await db.getChannelStats(channelId, days ? parseInt(days) : 30);
  });
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return "****" + key.slice(-4);
}
