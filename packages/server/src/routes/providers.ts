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
    const provider = db.createProvider(body);
    providerRegistry.reload(db);
    return reply.code(201).send(provider);
  });

  fastify.get("/api/providers", async () => {
    return db.listProviders().map(p => ({ ...p, apiKey: maskKey(p.apiKey) }));
  });

  fastify.get("/api/providers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const provider = db.getProvider(id);
    if (!provider) return reply.code(404).send({ error: "Provider not found" });
    return { ...provider, apiKey: maskKey(provider.apiKey) };
  });

  fastify.put("/api/providers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const updated = db.updateProvider(id, body);
    if (!updated) return reply.code(404).send({ error: "Provider not found" });
    providerRegistry.reload(db);
    return { ...updated, apiKey: maskKey(updated.apiKey) };
  });

  fastify.delete("/api/providers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = db.deleteProvider(id);
    if (!deleted) return reply.code(404).send({ error: "Provider not found" });
    providerRegistry.reload(db);
    return { success: true };
  });
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return "****" + key.slice(-4);
}
