import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";

export async function chatRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { agentLoop } = opts.ctx;

  // Non-streaming chat
  fastify.post("/api/chat", async (request, reply) => {
    const agentConfig = request.agentConfig;
    if (!agentConfig) {
      return reply.code(401).send({ error: "No agent resolved" });
    }

    const body = request.body as { message: string; sessionId?: string };
    if (!body.message) {
      return reply.code(400).send({ error: "message is required" });
    }

    const result = await agentLoop.run(agentConfig, body.message, body.sessionId);
    return {
      reply: result.reply,
      sessionId: result.sessionId,
      toolCalls: result.toolCalls,
      usage: result.usage,
    };
  });

  // Streaming chat
  fastify.post("/api/chat/stream", async (request, reply) => {
    const agentConfig = request.agentConfig;
    if (!agentConfig) {
      return reply.code(401).send({ error: "No agent resolved" });
    }

    const body = request.body as { message: string; sessionId?: string };
    if (!body.message) {
      return reply.code(400).send({ error: "message is required" });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const stream = agentLoop.runStream(agentConfig, body.message, body.sessionId);
    for await (const chunk of stream) {
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
  });
}
