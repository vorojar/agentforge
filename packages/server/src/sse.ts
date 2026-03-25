import type { FastifyReply, FastifyBaseLogger } from "fastify";
import type { StreamEvent } from "@agentforge/core";

export async function pipeStreamToSSE(
  reply: FastifyReply,
  stream: AsyncIterable<StreamEvent>,
  log: FastifyBaseLogger,
) {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    for await (const chunk of stream) {
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    reply.raw.write("data: [DONE]\n\n");
  } catch (error) {
    log.error(error, "Streaming chat failed");
    reply.raw.write(`data: ${JSON.stringify({ error: "LLM provider error", message: (error as Error).message })}\n\n`);
  }
  reply.raw.end();
}
