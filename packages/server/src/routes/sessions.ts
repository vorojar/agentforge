import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";
import type { ContentBlock, ImageBlock, Message } from "@agentforge/types";
import { resolveWorkspaceId } from "../workspace.js";

function extractFirstUserInput(messages: Message[]): { text: string; images: ImageBlock[] } | null {
  const first = messages.find((message) => message.role === "user");
  if (!first) return null;
  if (typeof first.content === "string") return { text: first.content, images: [] };
  const blocks: ContentBlock[] = first.content;
  return {
    text: blocks
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join(""),
    images: blocks.filter((block): block is ImageBlock => block.type === "image"),
  };
}

export async function sessionRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db, agentLoop } = opts.ctx;

  fastify.get("/api/sessions", async (request) => {
    const { agentId } = request.query as { agentId?: string };
    return await db.listSessions(agentId, await resolveWorkspaceId(request, db));
  });

  fastify.get("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const session = await db.getSession(id);
    if (!session || session.workspaceId !== workspaceId) {
      return reply.code(404).send({ error: "Session not found" });
    }
    return session;
  });

  fastify.get("/api/sessions/:id/messages", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const session = await db.getSession(id);
    if (!session || session.workspaceId !== workspaceId) {
      return reply.code(404).send({ error: "Session not found" });
    }
    return await db.getMessages(id);
  });

  fastify.get("/api/sessions/:id/family", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const session = await db.getSession(id);
    if (!session || session.workspaceId !== workspaceId) {
      return reply.code(404).send({ error: "Session not found" });
    }
    return await db.listSessionFamily(session.rootSessionId ?? session.id);
  });

  fastify.post("/api/sessions/:id/rerun", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { providerId?: string; model?: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const session = await db.getSession(id);
    if (!session || session.workspaceId !== workspaceId) return reply.code(404).send({ error: "Session not found" });

    const rootId = session.rootSessionId ?? session.id;
    const input = extractFirstUserInput(await db.getMessages(rootId));
    if (!input) return reply.code(400).send({ error: "Root session has no user message to rerun" });

    const agent = await db.getAgent(session.agentId);
    if (!agent) return reply.code(404).send({ error: "Agent not found for this session" });

    let rerunAgent = agent;
    if (body.providerId || body.model) {
      if (!body.providerId) {
        return reply.code(400).send({ error: "providerId is required when selecting a rerun model" });
      }
      const provider = await db.getProvider(body.providerId);
      if (!provider || provider.workspaceId !== workspaceId) return reply.code(404).send({ error: "Selected model not found" });
      if (!provider.enabled) return reply.code(400).send({ error: "Selected model is disabled" });
      if (body.model && body.model !== provider.defaultModel) {
        return reply.code(400).send({ error: "Selected model does not match provider library" });
      }
      rerunAgent = {
        ...agent,
        providerId: provider.id,
        model: provider.defaultModel,
        fallbackModels: [],
      };
    }

    const newSession = await db.createSession(agent.id, { sourceSessionId: session.id, workspaceId: session.workspaceId });
    try {
      const result = await agentLoop.run(
        rerunAgent,
        input.text,
        newSession.id,
        input.images.length > 0 ? input.images : undefined,
      );
      return { sessionId: result.sessionId, reply: result.reply, usage: result.usage };
    } catch (error) {
      request.log.error(error, "Rerun failed");
      return reply.code(502).send({ error: "LLM provider error", message: (error as Error).message });
    }
  });

  fastify.delete("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    const session = await db.getSession(id);
    if (!session || session.workspaceId !== workspaceId) return reply.code(404).send({ error: "Session not found" });
    const deleted = await db.deleteSession(id);
    if (!deleted) {
      return reply.code(404).send({ error: "Session not found" });
    }
    return { success: true };
  });
}
