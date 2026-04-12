import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";
import { pipeStreamToSSE } from "../sse.js";
import type { ImageBlock } from "@agentforge/types";

/**
 * 将请求体中的 images 字段转换为 ImageBlock 数组。
 * 支持两种格式：
 *   - base64: { type: "base64", data: string, mediaType: string }
 *   - url:    { type: "url", url: string }
 */
function parseImageBlocks(
  images?: Array<{ type: "base64"; data: string; mediaType: string } | { type: "url"; url: string }>
): ImageBlock[] | undefined {
  if (!images?.length) return undefined;
  return images.map(img => ({ type: "image" as const, source: img }));
}

export async function chatRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { agentLoop } = opts.ctx;

  fastify.post("/api/chat", async (request, reply) => {
    const agentConfig = request.agentConfig;
    if (!agentConfig) return reply.code(401).send({ error: "No agent resolved" });

    const body = request.body as {
      message: string;
      sessionId?: string;
      images?: Array<{ type: "base64"; data: string; mediaType: string } | { type: "url"; url: string }>;
    };
    if (!body.message && !body.images?.length) return reply.code(400).send({ error: "message or images is required" });

    try {
      const result = await agentLoop.run(agentConfig, body.message ?? "", body.sessionId, parseImageBlocks(body.images));
      return { reply: result.reply, thinking: result.thinking, sessionId: result.sessionId, toolCalls: result.toolCalls, usage: result.usage };
    } catch (error) {
      request.log.error(error, "Chat request failed");
      return reply.code(502).send({ error: "LLM provider error", message: (error as Error).message });
    }
  });

  fastify.post("/api/chat/stream", async (request, reply) => {
    const agentConfig = request.agentConfig;
    if (!agentConfig) return reply.code(401).send({ error: "No agent resolved" });

    const body = request.body as {
      message: string;
      sessionId?: string;
      images?: Array<{ type: "base64"; data: string; mediaType: string } | { type: "url"; url: string }>;
    };
    if (!body.message && !body.images?.length) return reply.code(400).send({ error: "message or images is required" });

    await pipeStreamToSSE(reply, agentLoop.runStream(agentConfig, body.message ?? "", body.sessionId, parseImageBlocks(body.images)), request.log);
  });
}
