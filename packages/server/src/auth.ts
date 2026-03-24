import type { AgentConfig } from "@agentforge/types";

declare module "fastify" {
  interface FastifyRequest {
    agentConfig?: AgentConfig;
  }
}
