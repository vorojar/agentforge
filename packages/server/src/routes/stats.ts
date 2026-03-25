import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";

export async function statsRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db } = opts.ctx;

  // Aggregate stats
  fastify.get("/api/stats", async () => {
    const agents = db.listAgents();
    const usage = db.getUsageStats();
    const todayStats = db.getDailyStats(undefined, 1);
    const today = todayStats.length > 0 ? todayStats[todayStats.length - 1] : null;
    const allSessions = db.listSessions();
    const nowDate = new Date().toISOString().slice(0, 10);

    return {
      totalAgents: agents.length,
      activeAgents: agents.filter((a) => a.enabled).length,
      totalSessions: allSessions.length,
      sessionsToday: allSessions.filter(s => s.createdAt.slice(0, 10) === nowDate).length,
      tokensToday: today ? today.tokensIn + today.tokensOut : 0,
      totalRequests: usage.totalRequests,
      totalTokensIn: usage.totalTokensIn,
      totalTokensOut: usage.totalTokensOut,
      defaultModel: opts.ctx.config.defaultModel,
    };
  });

  // Per-agent usage stats
  fastify.get("/api/stats/agents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = db.getAgent(id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    const usage = db.getUsageStats(id);
    const daily = db.getDailyStats(id);
    return { agent: agent.name, ...usage, daily };
  });

  // Daily breakdown (supports ?days=7 query param)
  fastify.get("/api/stats/daily", async (request) => {
    const { agentId, days } = request.query as { agentId?: string; days?: string };
    return db.getDailyStats(agentId, days ? parseInt(days) : 30);
  });

  // Model usage breakdown
  fastify.get("/api/stats/models", async () => {
    return db.getModelStats();
  });
}
