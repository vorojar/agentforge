import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";

export async function statsRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db } = opts.ctx;

  fastify.get("/api/stats", async () => {
    const [usage, sessions, todayStats] = await Promise.all([
      db.getUsageStats(),
      db.getSessionCounts(),
      db.getDailyStats(undefined, 1),
    ]);
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

  fastify.get("/api/stats/agents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = await db.getAgent(id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    const usage = await db.getUsageStats(id);
    const daily = await db.getDailyStats(id);
    return { agent: agent.name, ...usage, daily };
  });

  fastify.get("/api/stats/daily", async (request) => {
    const { agentId, days, startDate, endDate, granularity } = request.query as { agentId?: string; days?: string; startDate?: string; endDate?: string; granularity?: string };
    return await db.getDailyStats(agentId, days ? parseInt(days) : 30, startDate, endDate, granularity);
  });

  fastify.get("/api/stats/models", async (request) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    return await db.getModelStats(startDate, endDate);
  });

  fastify.get("/api/stats/agents", async (request) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    const [agents, stats] = await Promise.all([db.listAgents(), db.getAgentUsageStats(startDate, endDate)]);
    const agentMap = new Map(agents.map(a => [a.id, a.name]));
    return stats
      .map(u => ({ ...u, name: agentMap.get(u.agentId) ?? u.agentId }))
      .filter(u => u.totalRequests > 0);
  });

  fastify.get("/api/stats/proxy", async () => {
    return await db.getProxyOverview();
  });

  fastify.get("/api/stats/proxy/daily", async (request) => {
    const { days, startDate, endDate, granularity } = request.query as { days?: string; startDate?: string; endDate?: string; granularity?: string };
    return await db.getProxyDailyStats(days ? parseInt(days) : 30, startDate, endDate, granularity);
  });
}
