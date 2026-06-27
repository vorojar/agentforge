import type { FastifyRequest } from "fastify";
import type { DatabaseAdapter } from "@agentforge/types";

export async function resolveWorkspaceId(request: FastifyRequest, db: DatabaseAdapter): Promise<string> {
  const header = request.headers["x-workspace-id"];
  if (typeof header === "string" && header.trim()) return header.trim();

  const query = request.query as { workspaceId?: string } | undefined;
  if (query?.workspaceId?.trim()) return query.workspaceId.trim();

  const body = request.body as { workspaceId?: string } | undefined;
  if (body?.workspaceId?.trim()) return body.workspaceId.trim();

  return (await db.ensureDefaultTenant()).workspace.id;
}
