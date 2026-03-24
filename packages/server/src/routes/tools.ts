import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";

export async function toolRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { toolRegistry } = opts.ctx;

  fastify.get("/api/tools", async () => {
    return toolRegistry.getDefinitions();
  });
}
