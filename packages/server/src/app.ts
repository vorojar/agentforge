import { createHash } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import type { AppContext } from "./bootstrap.js";
import "./auth.js"; // type augmentation for FastifyRequest.agentConfig
import { agentRoutes } from "./routes/agents.js";
import { chatRoutes } from "./routes/chat.js";
import { sessionRoutes } from "./routes/sessions.js";
import { toolRoutes } from "./routes/tools.js";
import { skillRoutes } from "./routes/skills.js";
import { statsRoutes } from "./routes/stats.js";

export function createApp(ctx: AppContext) {
  const fastify = Fastify({ logger: true });

  fastify.register(cors, { origin: true });

  // Chat routes — API key auth applied directly on scope
  fastify.register(async (scope) => {
    scope.decorateRequest("agentConfig", undefined);

    scope.addHook("onRequest", async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return reply.code(401).send({ error: "Unauthorized: missing Bearer token" });
      }

      const rawKey = authHeader.slice(7);
      const keyHash = createHash("sha256").update(rawKey).digest("hex");
      const apiKey = ctx.db.getApiKeyByHash(keyHash);

      if (!apiKey || !apiKey.enabled) {
        return reply.code(401).send({ error: "Unauthorized: invalid or disabled API key" });
      }

      const agent = ctx.db.getAgent(apiKey.agentId);
      if (!agent || !agent.enabled) {
        return reply.code(401).send({ error: "Unauthorized: agent not found or disabled" });
      }

      ctx.db.touchApiKey(apiKey.id);
      request.agentConfig = agent;
    });

    scope.register(chatRoutes, { ctx });
  });

  // Admin routes — admin secret auth applied directly on scope
  fastify.register(async (scope) => {
    scope.addHook("onRequest", async (request, reply) => {
      const secret = request.headers["x-admin-secret"];
      if (secret !== ctx.config.adminSecret) {
        return reply.code(401).send({ error: "Unauthorized: invalid admin secret" });
      }
    });

    scope.register(agentRoutes, { ctx });
    scope.register(sessionRoutes, { ctx });
    scope.register(toolRoutes, { ctx });
    scope.register(skillRoutes, { ctx });
    scope.register(statsRoutes, { ctx });
  });

  return fastify;
}
