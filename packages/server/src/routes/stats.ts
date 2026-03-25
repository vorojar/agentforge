import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";

export async function statsRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db } = opts.ctx;

  // Aggregate stats
  fastify.get("/api/stats", async () => {
    const agents = db.listAgents();
    const totalAgents = agents.length;
    const activeAgents = agents.filter((a) => a.enabled).length;

    const usage = db.getUsageStats();
    const todayStats = db.getDailyStats(undefined, 1);
    const today = todayStats.length > 0 ? todayStats[todayStats.length - 1] : null;

    const todaySessions = db.listSessions().filter((s) => {
      const sessionDate = s.createdAt.slice(0, 10);
      const nowDate = new Date().toISOString().slice(0, 10);
      return sessionDate === nowDate;
    });

    return {
      totalAgents,
      activeAgents,
      sessionsToday: todaySessions.length,
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
    if (!agent) {
      return reply.code(404).send({ error: "Agent not found" });
    }
    const usage = db.getUsageStats(id);
    const daily = db.getDailyStats(id);
    return { agent: agent.name, ...usage, daily };
  });

  // Daily breakdown
  fastify.get("/api/stats/daily", async (request) => {
    const { agentId } = request.query as { agentId?: string };
    return db.getDailyStats(agentId);
  });
}
