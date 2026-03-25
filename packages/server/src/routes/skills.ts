import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";

export async function skillRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { skillRegistry } = opts.ctx;

  // List skills (read-only, loaded from filesystem)
  fastify.get("/api/skills", async () => {
    return skillRegistry.list();
  });

  // Get single skill by name
  fastify.get("/api/skills/:name", async (request, reply) => {
    const { name } = request.params as { name: string };
    const skill = skillRegistry.get(name);
    if (!skill) {
      return reply.code(404).send({ error: "Skill not found" });
    }
    return skill;
  });
}
