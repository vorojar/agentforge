import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";
import { createHttpTools, escapeJsonStringValue, isPlaceholderInJsonString } from "@agentforge/tools";
import { resolveWorkspaceId } from "../workspace.js";
import { recordAuditLog } from "../audit.js";

export async function httpToolRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db, toolRegistry } = opts.ctx;

  async function syncToRegistry(httpToolId: string) {
    const ht = await db.getHttpTool(httpToolId);
    if (!ht) return;
    toolRegistry.unregister(ht.name);
    if (ht.enabled) {
      const [runtimeTool] = createHttpTools([ht]);
      if (runtimeTool) toolRegistry.register(runtimeTool);
    }
  }

  fastify.post("/api/http-tools", async (request, reply) => {
    const body = request.body as {
      name: string;
      description?: string;
      method?: string;
      url: string;
      headers?: Record<string, string>;
      parameters?: { type: "object"; properties: Record<string, unknown>; required?: string[] };
      bodyTemplate?: string;
      category?: string;
    };

    if (!body.name || !body.url) {
      return reply.code(400).send({ error: "name and url are required" });
    }

    const workspaceId = await resolveWorkspaceId(request, db);
    const httpTool = await db.createHttpTool({ ...body, workspaceId });
    await syncToRegistry(httpTool.id);
    await recordAuditLog(db, request, {
      workspaceId,
      action: "http_tool.create",
      resourceType: "http_tool",
      resourceId: httpTool.id,
      metadata: { name: httpTool.name, method: httpTool.method, url: httpTool.url, enabled: httpTool.enabled },
    });
    return reply.code(201).send(httpTool);
  });

  fastify.get("/api/http-tools", async (request) => {
    const workspaceId = await resolveWorkspaceId(request, db);
    return await db.listHttpTools(workspaceId);
  });

  fastify.get("/api/http-tools/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const httpTool = await db.getHttpTool(id);
    if (!httpTool || httpTool.workspaceId !== workspaceId) {
      return reply.code(404).send({ error: "HTTP tool not found" });
    }
    return httpTool;
  });

  fastify.put("/api/http-tools/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const workspaceId = await resolveWorkspaceId(request, db);

    const oldTool = await db.getHttpTool(id);
    if (!oldTool || oldTool.workspaceId !== workspaceId) return reply.code(404).send({ error: "HTTP tool not found" });
    if (oldTool) toolRegistry.unregister(oldTool.name);

    const updated = await db.updateHttpTool(id, body);
    if (!updated) {
      return reply.code(404).send({ error: "HTTP tool not found" });
    }

    if (updated.enabled) {
      const [runtimeTool] = createHttpTools([updated]);
      if (runtimeTool) toolRegistry.register(runtimeTool);
    }

    await recordAuditLog(db, request, {
      workspaceId,
      action: "http_tool.update",
      resourceType: "http_tool",
      resourceId: id,
      metadata: {
        fields: Object.keys(body).filter((key) => !["headers", "bodyTemplate", "workspaceId"].includes(key)),
        name: updated.name,
        method: updated.method,
        url: updated.url,
        enabled: updated.enabled,
      },
    });
    return updated;
  });

  fastify.delete("/api/http-tools/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);

    const httpTool = await db.getHttpTool(id);
    if (!httpTool || httpTool.workspaceId !== workspaceId) return reply.code(404).send({ error: "HTTP tool not found" });
    if (httpTool) toolRegistry.unregister(httpTool.name);

    const deleted = await db.deleteHttpTool(id);
    if (!deleted) {
      return reply.code(404).send({ error: "HTTP tool not found" });
    }
    await recordAuditLog(db, request, {
      workspaceId,
      action: "http_tool.delete",
      resourceType: "http_tool",
      resourceId: id,
      metadata: { name: httpTool.name, method: httpTool.method, url: httpTool.url },
    });
    return { success: true };
  });

  fastify.post("/api/http-tools/:id/test", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const ht = await db.getHttpTool(id);
    if (!ht || ht.workspaceId !== workspaceId) return reply.code(404).send({ error: "HTTP tool not found" });

    const params = (request.body as Record<string, string>) ?? {};

    let url = ht.url;
    let body = ht.bodyTemplate;
    for (const [key, value] of Object.entries(params)) {
      const placeholder = `{${key}}`;
      url = url.replaceAll(placeholder, encodeURIComponent(String(value)));
      if (body) {
        const strVal = String(value);
        const escaped = isPlaceholderInJsonString(body, placeholder)
          ? escapeJsonStringValue(strVal)
          : strVal;
        body = body.replaceAll(placeholder, escaped);
      }
    }

    const options: RequestInit = {
      method: ht.method,
      headers: { ...ht.headers, "Content-Type": "application/json" },
    };
    if (["POST", "PUT", "PATCH"].includes(ht.method.toUpperCase()) && body) {
      options.body = body;
    }

    try {
      const response = await fetch(url, options);
      const text = await response.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      return reply.send({ ok: response.ok, status: response.status, body: parsed });
    } catch (error) {
      return reply.code(502).send({ ok: false, error: (error as Error).message });
    }
  });
}
