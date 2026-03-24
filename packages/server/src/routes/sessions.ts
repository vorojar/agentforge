import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";

export async function sessionRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db } = opts.ctx;

  // List sessions
  fastify.get("/api/sessions", async (request) => {
    const { agentId } = request.query as { agentId?: string };
    return db.listSessions(agentId);
  });

  // Get session detail
  fastify.get("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = db.getSession(id);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }
    return session;
  });

  // Get session messages
  fastify.get("/api/sessions/:id/messages", async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = db.getSession(id);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }
    return db.getMessages(id);
  });

  // Delete session
  fastify.delete("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = db.deleteSession(id);
    if (!deleted) {
      return reply.code(404).send({ error: "Session not found" });
    }
    return { success: true };
  });
}
