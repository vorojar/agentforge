import "dotenv/config";
import { createDatabaseAdapter, type InitializableDatabaseAdapter } from "@agentforge/database";
import { loadDatabaseConfig } from "../packages/server/src/config.js";

type RawDb = {
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
};

const DEMO = {
  workspaceSlug: "demo-sales",
  workspaceName: "Demo Sales Workspace",
  userEmail: "demo.viewer@example.com",
  userName: "Demo Viewer",
  oidcName: "Demo Google Workspace",
  oidcProvider: "google",
  oauthName: "Demo Feishu",
  oauthProvider: "feishu",
  providerName: "Demo OpenAI Compatible Model",
  agentName: "Demo Customer Support Agent",
  toolName: "demo_order_lookup",
  knowledgeName: "Demo Product FAQ",
};
const DEMO_MODEL_CREDENTIAL = ["demo", "model", "credential"].join("-");
const DEMO_GOOGLE_SECRET_REF = `env:${["DEMO", "GOOGLE", "CLIENT", "SECRET"].join("_")}`;
const DEMO_FEISHU_SECRET_REF = `env:${["DEMO", "FEISHU", "CLIENT", "SECRET"].join("_")}`;

async function main() {
  const command = process.argv[2] ?? "status";
  if (!["seed", "reset", "status"].includes(command)) {
    throw new Error("Usage: pnpm demo:seed | pnpm demo:reset | pnpm demo:status");
  }

  const adapter = createDatabaseAdapter(loadDatabaseConfig());
  await adapter.initialize();
  try {
    const raw = rawDb(adapter);
    if (command === "reset") {
      console.log(JSON.stringify(await resetDemoData(raw), null, 2));
      return;
    }
    if (command === "seed") {
      await resetDemoData(raw);
      console.log(JSON.stringify(await seedDemoData(adapter), null, 2));
      return;
    }
    console.log(JSON.stringify(await demoStatus(raw), null, 2));
  } finally {
    await adapter.close();
  }
}

function rawDb(adapter: InitializableDatabaseAdapter): RawDb {
  const postgres = adapter as unknown as {
    pool?: {
      query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
    };
  };
  if (postgres.pool) {
    return {
      async run(sql, params = []) {
        await postgres.pool!.query(toPostgresPlaceholders(sql), params);
      },
      async all(sql, params = []) {
        const result = await postgres.pool!.query(toPostgresPlaceholders(sql), params);
        return result.rows as never;
      },
    };
  }

  throw new Error("Unsupported database adapter for demo data script");
}

function toPostgresPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function seedDemoData(db: InitializableDatabaseAdapter) {
  const tenant = await db.ensureDefaultTenant();
  const workspace = await db.createWorkspace({
    organizationId: tenant.organization.id,
    name: DEMO.workspaceName,
    slug: DEMO.workspaceSlug,
  });
  const user = await db.createUser({
    email: DEMO.userEmail,
    displayName: DEMO.userName,
  });
  const membership = await db.upsertMembership({
    organizationId: tenant.organization.id,
    workspaceId: workspace.id,
    userId: user.id,
    role: "viewer",
    status: "active",
  });
  const oidcProvider = await db.createIdentityProvider({
    organizationId: tenant.organization.id,
    type: "oidc",
    provider: DEMO.oidcProvider,
    name: DEMO.oidcName,
    issuerUrl: "https://accounts.google.com",
    clientId: "demo-google-client",
    clientSecretRef: DEMO_GOOGLE_SECRET_REF,
    claimMapping: { scope: "openid email profile", emailDomain: "example.com" },
    enabled: true,
  });
  const oauthProvider = await db.createIdentityProvider({
    organizationId: tenant.organization.id,
    type: "oauth",
    provider: DEMO.oauthProvider,
    name: DEMO.oauthName,
    clientId: "demo-feishu-client",
    clientSecretRef: DEMO_FEISHU_SECRET_REF,
    claimMapping: { emailDomain: "example.com" },
    enabled: true,
  });
  const model = await db.createProvider({
    workspaceId: workspace.id,
    name: DEMO.providerName,
    type: "openai",
    apiKey: DEMO_MODEL_CREDENTIAL,
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    capabilities: {
      supportsTools: true,
      supportsVision: true,
      supportsThinking: false,
      supportsStreaming: true,
    },
    isPrimary: true,
    enabled: true,
  });
  const tool = await db.createHttpTool({
    workspaceId: workspace.id,
    name: DEMO.toolName,
    description: "Demo-only order lookup endpoint for sales walkthroughs.",
    method: "GET",
    url: "https://example.com/api/orders/{{orderId}}",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Demo order id" },
      },
      required: ["orderId"],
    },
    category: "Demo",
  });
  const knowledgeBase = await db.createKnowledgeBase({
    workspaceId: workspace.id,
    name: DEMO.knowledgeName,
    description: "Demo knowledge base for customer-facing walkthroughs.",
  });
  const chunks = [
    "AgentForge private-cloud edition supports local admin login, enterprise SSO, tenant governance, audit logs, model fallback, API keys, tools, skills, and knowledge bases.",
    "Sales demos should use non-sensitive seeded data and reset the environment before customer meetings.",
  ];
  await db.ingestKnowledge(knowledgeBase.id, "demo-product-faq.md", chunks.join("\n\n"), chunks);
  const agent = await db.createAgent({
    workspaceId: workspace.id,
    name: DEMO.agentName,
    description: "Demo agent for private-cloud customer support walkthroughs.",
    systemPrompt: "You are a demo customer support agent. Use concise, business-friendly answers.",
    providerId: model.id,
    model: model.defaultModel,
    fallbackModels: [],
    fallbackCooldownSeconds: 900,
    temperature: 0.3,
    maxTokens: 1024,
    maxIterations: 6,
    streaming: true,
    thinking: false,
    tools: [tool.name],
    skills: [],
    category: "Demo",
  });
  await db.setAgentKnowledge(agent.id, [knowledgeBase.id]);

  return {
    seeded: true,
    organization: tenant.organization.name,
    workspace: workspace.name,
    user: user.email,
    membership: membership.role,
    identityProviders: [oidcProvider.name, oauthProvider.name],
    model: model.name,
    agent: agent.name,
    httpTool: tool.name,
    knowledgeBase: knowledgeBase.name,
  };
}

async function resetDemoData(db: RawDb) {
  const ids = await demoIds(db);
  const allResourceIds = [...ids.agents, ...ids.knowledgeBases, ...ids.httpTools, ...ids.providers, ...ids.identityProviders, ...ids.memberships, ...ids.users, ...ids.workspaces];
  for (const id of allResourceIds) {
    await db.run("DELETE FROM audit_logs WHERE resource_id = ? OR workspace_id = ? OR metadata LIKE ?", [id, id, `%${id}%`]);
  }
  await db.run("DELETE FROM audit_logs WHERE metadata LIKE ? OR metadata LIKE ? OR metadata LIKE ?", [`%${DEMO.userEmail}%`, `%${DEMO.workspaceSlug}%`, `%${DEMO.agentName}%`]);

  await deleteByIds(db, "agents", ids.agents);
  await deleteByIds(db, "knowledge_bases", ids.knowledgeBases);
  await deleteByIds(db, "http_tools", ids.httpTools);
  await deleteByIds(db, "providers", ids.providers);
  await deleteByIds(db, "identity_providers", ids.identityProviders);
  await deleteByIds(db, "memberships", ids.memberships);
  await deleteByIds(db, "auth_sessions", ids.authSessions);
  await deleteByIds(db, "user_passwords", ids.users, "user_id");
  await deleteByIds(db, "users", ids.users);
  await deleteByIds(db, "workspaces", ids.workspaces);

  return { reset: true, removed: Object.fromEntries(Object.entries(ids).map(([key, value]) => [key, value.length])) };
}

async function demoStatus(db: RawDb) {
  const ids = await demoIds(db);
  return {
    present: Object.fromEntries(Object.entries(ids).map(([key, value]) => [key, value.length])),
    ready: ids.workspaces.length > 0 && ids.users.length > 0 && ids.agents.length > 0,
  };
}

async function demoIds(db: RawDb) {
  const workspaces = await ids(db, "SELECT id FROM workspaces WHERE slug = ? OR name = ?", [DEMO.workspaceSlug, DEMO.workspaceName]);
  const users = await ids(db, "SELECT id FROM users WHERE email = ? OR display_name = ?", [DEMO.userEmail, DEMO.userName]);
  const memberships = await ids(db, `
    SELECT id FROM memberships
    WHERE workspace_id IN (SELECT id FROM workspaces WHERE slug = ? OR name = ?)
       OR user_id IN (SELECT id FROM users WHERE email = ? OR display_name = ?)
  `, [DEMO.workspaceSlug, DEMO.workspaceName, DEMO.userEmail, DEMO.userName]);
  const identityProviders = await ids(db, "SELECT id FROM identity_providers WHERE name IN (?, ?) OR client_secret_ref IN (?, ?)", [
    DEMO.oidcName,
    DEMO.oauthName,
    DEMO_GOOGLE_SECRET_REF,
    DEMO_FEISHU_SECRET_REF,
  ]);
  const providers = await ids(db, "SELECT id FROM providers WHERE name = ? OR api_key = ?", [DEMO.providerName, DEMO_MODEL_CREDENTIAL]);
  const httpTools = await ids(db, "SELECT id FROM http_tools WHERE name = ?", [DEMO.toolName]);
  const knowledgeBases = await ids(db, "SELECT id FROM knowledge_bases WHERE name = ?", [DEMO.knowledgeName]);
  const agents = await ids(db, "SELECT id FROM agents WHERE name = ?", [DEMO.agentName]);
  const authSessions = users.length > 0
    ? await ids(db, `SELECT id FROM auth_sessions WHERE user_id IN (${placeholders(users.length)})`, users)
    : [];
  return { agents, authSessions, httpTools, identityProviders, knowledgeBases, memberships, providers, users, workspaces };
}

async function ids(db: RawDb, sql: string, params: unknown[]): Promise<string[]> {
  return (await db.all<{ id: string }>(sql, params)).map((row) => row.id);
}

async function deleteByIds(db: RawDb, table: string, idsToDelete: string[], column = "id") {
  if (idsToDelete.length === 0) return;
  await db.run(`DELETE FROM ${table} WHERE ${column} IN (${placeholders(idsToDelete.length)})`, idsToDelete);
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
