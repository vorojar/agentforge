import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";
import { pipeStreamToSSE } from "../sse.js";

export async function chatRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { agentLoop } = opts.ctx;

  fastify.post("/api/chat", async (request, reply) => {
    const agentConfig = request.agentConfig;
    if (!agentConfig) return reply.code(401).send({ error: "No agent resolved" });

    const body = request.body as { message: string; sessionId?: string };
    if (!body.message) return reply.code(400).send({ error: "message is required" });

    try {
      const result = await agentLoop.run(agentConfig, body.message, body.sessionId);
      return { reply: result.reply, sessionId: result.sessionId, toolCalls: result.toolCalls, usage: result.usage };
    } catch (error) {
      request.log.error(error, "Chat request failed");
      return reply.code(502).send({ error: "LLM provider error", message: (error as Error).message });
    }
  });

  fastify.post("/api/chat/stream", async (request, reply) => {
    const agentConfig = request.agentConfig;
    if (!agentConfig) return reply.code(401).send({ error: "No agent resolved" });

    const body = request.body as { message: string; sessionId?: string };
    if (!body.message) return reply.code(400).send({ error: "message is required" });

    await pipeStreamToSSE(reply, agentLoop.runStream(agentConfig, body.message, body.sessionId), request.log);
  });
}
