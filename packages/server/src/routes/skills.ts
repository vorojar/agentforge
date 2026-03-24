import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";

export async function skillRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db, skillRegistry } = opts.ctx;

  // List skills
  fastify.get("/api/skills", async () => {
    return db.listSkills();
  });

  // Create skill
  fastify.post("/api/skills", async (request, reply) => {
    const body = request.body as { name: string; description?: string; content: string };
    if (!body.name || !body.content) {
      return reply.code(400).send({ error: "name and content are required" });
    }
    const skill = db.createSkill(body);
    skillRegistry.register(skill);
    return reply.code(201).send(skill);
  });

  // Update skill
  fastify.put("/api/skills/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const updated = db.updateSkill(id, body);
    if (!updated) {
      return reply.code(404).send({ error: "Skill not found" });
    }
    // Re-register the updated skill
    skillRegistry.register(updated);
    return updated;
  });

  // Delete skill
  fastify.delete("/api/skills/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = db.deleteSkill(id);
    if (!deleted) {
      return reply.code(404).send({ error: "Skill not found" });
    }
    return { success: true };
  });
}
