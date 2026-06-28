import { config as loadEnv } from "dotenv";
import { PostgresAdapter } from "../packages/database/src/postgres.js";
import { loadDatabaseConfig } from "../packages/server/src/config.js";

loadEnv({ quiet: true });

const database = loadDatabaseConfig(process.env);
if (database.type !== "postgres") {
  console.error("DB_TYPE=postgres, POSTGRES_URL, or DATABASE_URL is required for PostgreSQL migration verification.");
  process.exit(1);
}

const db = new PostgresAdapter(database);

try {
  await db.initialize();
  const tenant = await db.ensureDefaultTenant();
  const workspace = await db.createWorkspace({
    organizationId: tenant.organization.id,
    name: `Migration Smoke ${Date.now()}`,
  });
  const agent = await db.createAgent({
    workspaceId: workspace.id,
    name: `Migration Smoke Agent ${Date.now()}`,
    systemPrompt: "migration smoke test",
  });
  const kb = await db.createKnowledgeBase({
    workspaceId: workspace.id,
    name: `Migration Smoke KB ${Date.now()}`,
  });
  await db.setAgentKnowledge(agent.id, [kb.id]);
  await db.createAuditLog({
    organizationId: tenant.organization.id,
    workspaceId: workspace.id,
    action: "migration.smoke",
    resourceType: "database",
    metadata: { agentId: agent.id, kbId: kb.id },
  });

  const logs = await db.listAuditLogs(tenant.organization.id, { workspaceId: workspace.id, limit: 5 });
  if (!logs.some((log) => log.action === "migration.smoke")) {
    throw new Error("Audit log smoke row was not persisted.");
  }

  console.log("PostgreSQL migrations verified: schema initialized and smoke CRUD passed.");
} finally {
  await db.close();
}
