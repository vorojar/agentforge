import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";
import { resolveWorkspaceId } from "../workspace.js";

export async function statsRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db } = opts.ctx;

  fastify.get("/api/stats", async (request) => {
    const workspaceId = await resolveWorkspaceId(request, db);
    const [usage, sessions, todayStats] = await Promise.all([
      db.getUsageStats(undefined, workspaceId),
      db.getSessionCounts(workspaceId),
      db.getDailyStats(undefined, 1, undefined, undefined, undefined, workspaceId),
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
    const workspaceId = await resolveWorkspaceId(request, db);
    const agent = await db.getAgent(id);
    if (!agent || agent.workspaceId !== workspaceId) return reply.code(404).send({ error: "Agent not found" });
    const usage = await db.getUsageStats(id, agent.workspaceId);
    const daily = await db.getDailyStats(id, undefined, undefined, undefined, undefined, agent.workspaceId);
    return { agent: agent.name, ...usage, daily };
  });

  fastify.get("/api/stats/daily", async (request) => {
    const { agentId, days, startDate, endDate, granularity } = request.query as { agentId?: string; days?: string; startDate?: string; endDate?: string; granularity?: string };
    return await db.getDailyStats(agentId, days ? parseInt(days) : 30, startDate, endDate, granularity, await resolveWorkspaceId(request, db));
  });

  fastify.get("/api/stats/models", async (request) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    return await db.getModelStats(startDate, endDate, await resolveWorkspaceId(request, db));
  });

  fastify.get("/api/stats/agents", async (request) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const [agents, stats] = await Promise.all([db.listAgents(workspaceId), db.getAgentUsageStats(startDate, endDate, workspaceId)]);
    const agentMap = new Map(agents.map(a => [a.id, a.name]));
    return stats
      .map(u => ({ ...u, name: agentMap.get(u.agentId) ?? u.agentId }))
      .filter(u => u.totalRequests > 0);
  });

  fastify.get("/api/stats/proxy", async (request) => {
    return await db.getProxyOverview(await resolveWorkspaceId(request, db));
  });

  fastify.get("/api/stats/proxy/daily", async (request) => {
    const { days, startDate, endDate, granularity } = request.query as { days?: string; startDate?: string; endDate?: string; granularity?: string };
    return await db.getProxyDailyStats(days ? parseInt(days) : 30, startDate, endDate, granularity, await resolveWorkspaceId(request, db));
  });
}
