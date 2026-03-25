import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";
import { createHttpTools } from "@agentforge/tools";

export async function httpToolRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db, toolRegistry } = opts.ctx;

  /** Sync a single HTTP tool into the runtime registry (register or replace). */
  function syncToRegistry(httpToolId: string) {
    const ht = db.getHttpTool(httpToolId);
    if (!ht) return;
    toolRegistry.unregister(ht.name);
    if (ht.enabled) {
      const [runtimeTool] = createHttpTools([ht]);
      if (runtimeTool) toolRegistry.register(runtimeTool);
    }
  }

  // Create HTTP tool
  fastify.post("/api/http-tools", async (request, reply) => {
    const body = request.body as {
      name: string;
      description?: string;
      method?: string;
      url: string;
      headers?: Record<string, string>;
      parameters?: { type: "object"; properties: Record<string, unknown>; required?: string[] };
      bodyTemplate?: string;
    };

    if (!body.name || !body.url) {
      return reply.code(400).send({ error: "name and url are required" });
    }

    const httpTool = db.createHttpTool(body);
    syncToRegistry(httpTool.id);
    return reply.code(201).send(httpTool);
  });

  // List HTTP tools
  fastify.get("/api/http-tools", async () => {
    return db.listHttpTools();
  });

  // Get single HTTP tool
  fastify.get("/api/http-tools/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const httpTool = db.getHttpTool(id);
    if (!httpTool) {
      return reply.code(404).send({ error: "HTTP tool not found" });
    }
    return httpTool;
  });

  // Update HTTP tool
  fastify.put("/api/http-tools/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    // Unregister old name before update (name may have changed)
    const oldTool = db.getHttpTool(id);
    if (oldTool) toolRegistry.unregister(oldTool.name);

    const updated = db.updateHttpTool(id, body);
    if (!updated) {
      return reply.code(404).send({ error: "HTTP tool not found" });
    }

    // Register with new name/config
    if (updated.enabled) {
      const [runtimeTool] = createHttpTools([updated]);
      if (runtimeTool) toolRegistry.register(runtimeTool);
    }

    return updated;
  });

  // Delete HTTP tool
  fastify.delete("/api/http-tools/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    // Unregister from runtime before deleting from DB
    const httpTool = db.getHttpTool(id);
    if (httpTool) toolRegistry.unregister(httpTool.name);

    const deleted = db.deleteHttpTool(id);
    if (!deleted) {
      return reply.code(404).send({ error: "HTTP tool not found" });
    }
    return { success: true };
  });
}
