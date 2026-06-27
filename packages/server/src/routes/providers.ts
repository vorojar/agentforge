import type { FastifyInstance } from "fastify";
import type { ModelCapabilities } from "@agentforge/types";
import type { AppContext } from "../bootstrap.js";
import { resolveWorkspaceId } from "../workspace.js";
import { recordAuditLog } from "../audit.js";

export async function providerRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db, providerRegistry } = opts.ctx;

  fastify.post("/api/providers", async (request, reply) => {
    const body = request.body as {
      name: string; type: string; apiKey: string;
      baseUrl?: string; defaultModel: string; capabilities?: Partial<ModelCapabilities>; isPrimary?: boolean;
    };
    if (!body.name || !body.type || !body.apiKey || !body.defaultModel) {
      return reply.code(400).send({ error: "name, type, apiKey, and defaultModel are required" });
    }
    const workspaceId = await resolveWorkspaceId(request, db);
    const provider = await db.createProvider({ ...body, workspaceId });
    await providerRegistry.reload(db);
    await recordAuditLog(db, request, {
      workspaceId,
      action: "provider.create",
      resourceType: "provider",
      resourceId: provider.id,
      metadata: {
        name: provider.name,
        type: provider.type,
        defaultModel: provider.defaultModel,
        enabled: provider.enabled,
        isPrimary: provider.isPrimary,
      },
    });
    return reply.code(201).send(provider);
  });

  fastify.get("/api/providers", async (request) => {
    const workspaceId = await resolveWorkspaceId(request, db);
    const list = await db.listProviders(workspaceId);
    return list.map(p => ({ ...p, apiKey: maskKey(p.apiKey) }));
  });

  fastify.get("/api/providers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const provider = await db.getProvider(id);
    if (!provider || provider.workspaceId !== workspaceId) return reply.code(404).send({ error: "Provider not found" });
    return { ...provider, apiKey: maskKey(provider.apiKey) };
  });

  fastify.put("/api/providers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const provider = await db.getProvider(id);
    if (!provider || provider.workspaceId !== workspaceId) return reply.code(404).send({ error: "Provider not found" });
    const body = request.body as Record<string, unknown>;
    const updated = await db.updateProvider(id, body);
    if (!updated) return reply.code(404).send({ error: "Provider not found" });
    await providerRegistry.reload(db);
    await recordAuditLog(db, request, {
      workspaceId,
      action: "provider.update",
      resourceType: "provider",
      resourceId: id,
      metadata: {
        fields: Object.keys(body).filter((key) => key !== "apiKey" && key !== "workspaceId"),
        name: updated.name,
        type: updated.type,
        defaultModel: updated.defaultModel,
        enabled: updated.enabled,
        isPrimary: updated.isPrimary,
        apiKeyChanged: Object.prototype.hasOwnProperty.call(body, "apiKey"),
      },
    });
    return { ...updated, apiKey: maskKey(updated.apiKey) };
  });

  fastify.delete("/api/providers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const provider = await db.getProvider(id);
    if (!provider || provider.workspaceId !== workspaceId) return reply.code(404).send({ error: "Provider not found" });
    const deleted = await db.deleteProvider(id);
    if (!deleted) return reply.code(404).send({ error: "Provider not found" });
    await providerRegistry.reload(db);
    await recordAuditLog(db, request, {
      workspaceId,
      action: "provider.delete",
      resourceType: "provider",
      resourceId: id,
      metadata: { name: provider.name, type: provider.type, defaultModel: provider.defaultModel },
    });
    return { success: true };
  });

  // --- Provider Channels ---

  fastify.post("/api/providers/:id/channels", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const provider = await db.getProvider(id);
    if (!provider || provider.workspaceId !== workspaceId) return reply.code(404).send({ error: "Provider not found" });

    const body = request.body as { name: string };
    if (!body.name) return reply.code(400).send({ error: "name is required" });

    const { channel, rawKey } = await db.createChannel(id, body.name);
    await recordAuditLog(db, request, {
      workspaceId,
      action: "provider_channel.create",
      resourceType: "provider_channel",
      resourceId: channel.id,
      metadata: { providerId: id, name: channel.name, keyPrefix: channel.keyPrefix },
    });
    return reply.code(201).send({ ...channel, rawKey });
  });

  fastify.get("/api/providers/:id/channels", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const provider = await db.getProvider(id);
    if (!provider || provider.workspaceId !== workspaceId) return reply.code(404).send({ error: "Provider not found" });

    const channels = await db.listChannels(id);
    return channels;
  });

  fastify.delete("/api/providers/:providerId/channels/:channelId", async (request, reply) => {
    const { providerId, channelId } = request.params as { providerId: string; channelId: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const provider = await db.getProvider(providerId);
    if (!provider || provider.workspaceId !== workspaceId) return reply.code(404).send({ error: "Provider not found" });
    const channels = await db.listChannels(providerId);
    if (!channels.some((channel) => channel.id === channelId && channel.workspaceId === workspaceId)) {
      return reply.code(404).send({ error: "Channel not found" });
    }
    const deleted = await db.deleteChannel(channelId);
    if (!deleted) return reply.code(404).send({ error: "Channel not found" });
    await recordAuditLog(db, request, {
      workspaceId,
      action: "provider_channel.delete",
      resourceType: "provider_channel",
      resourceId: channelId,
      metadata: { providerId },
    });
    return { success: true };
  });

  fastify.get("/api/providers/:id/channels/stats", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const provider = await db.getProvider(id);
    if (!provider || provider.workspaceId !== workspaceId) return reply.code(404).send({ error: "Provider not found" });
    return await db.getProviderChannelStats(id, startDate, endDate, provider.workspaceId);
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
