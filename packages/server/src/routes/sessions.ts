import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";

export async function sessionRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db } = opts.ctx;

  fastify.get("/api/sessions", async (request) => {
    const { agentId } = request.query as { agentId?: string };
    return await db.listSessions(agentId);
  });

  fastify.get("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await db.getSession(id);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }
    return session;
  });

  fastify.get("/api/sessions/:id/messages", async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await db.getSession(id);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }
    return await db.getMessages(id);
  });

  fastify.delete("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await db.deleteSession(id);
    if (!deleted) {
      return reply.code(404).send({ error: "Session not found" });
    }
    return { success: true };
  });
}
