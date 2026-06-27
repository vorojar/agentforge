import type { AgentConfig, AuthenticatedUser } from "@agentforge/types";

declare module "fastify" {
  interface FastifyRequest {
    agentConfig?: AgentConfig;
    currentUser?: AuthenticatedUser;
  }
}
