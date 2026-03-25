import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";

export async function statsRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db } = opts.ctx;

  // Aggregate stats
  fastify.get("/api/stats", async () => {
    const usage = db.getUsageStats();
    const sessions = db.getSessionCounts();
    const todayStats = db.getDailyStats(undefined, 1);
    const today = todayStats.length > 0 ? todayStats[todayStats.length - 1] : null;

    return {
      totalSessions: sessions.total,
      sessionsToday: sessions.today,
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

  // Agent usage breakdown (single GROUP BY query, no N+1)
  fastify.get("/api/stats/agents", async () => {
    const agents = db.listAgents();
    const agentMap = new Map(agents.map(a => [a.id, a.name]));
    return db.getAgentUsageStats()
      .map(u => ({ ...u, name: agentMap.get(u.agentId) ?? u.agentId }))
      .filter(u => u.totalRequests > 0);
  });
}
