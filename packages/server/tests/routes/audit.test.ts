import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../src/bootstrap.js";
import { createTestApp } from "../helpers.js";
import type { TenantBootstrapResult } from "@agentforge/types";

describe("Audit coverage", () => {
  let app: FastifyInstance;
  let ctx: AppContext;
  let tenant: TenantBootstrapResult;
  const adminHeaders = { "x-admin-secret": "test-secret" };

  beforeEach(async () => {
    const t = await createTestApp();
    app = t.app;
    ctx = t.ctx;
    tenant = await ctx.db.ensureDefaultTenant();
    await app.ready();
  });

  it("should audit local login and logout with the user actor", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "demo@example.com", password: "password" },
    });
    expect(login.statusCode).toBe(200);
    const userId = login.json().user.id;

    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: String(login.headers["set-cookie"]) },
    });
    expect(logout.statusCode).toBe(200);

    const logs = await ctx.db.listAuditLogs(tenant.organization.id);
    expect(logs.map((log) => log.action)).toEqual(expect.arrayContaining(["auth.local_login", "auth.logout"]));
    expect(logs.filter((log) => log.action.startsWith("auth.")).map((log) => log.actorUserId)).toEqual([userId, userId]);
  });

  it("should audit agent, API key, provider, and channel mutations without raw secrets", async () => {
    const agentRes = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: adminHeaders,
      payload: { name: "Audit Agent", systemPrompt: "test", model: "mock-model" },
    });
    expect(agentRes.statusCode).toBe(201);
    const agent = agentRes.json();
    const initialRawKey = agent.apiKeys[0].rawKey;

    const keyRes = await app.inject({
      method: "POST",
      url: `/api/agents/${agent.id}/keys`,
      headers: adminHeaders,
      payload: { name: "prod-key" },
    });
    expect(keyRes.statusCode).toBe(201);
    const key = keyRes.json();

    const deleteKey = await app.inject({
      method: "DELETE",
      url: `/api/agents/${agent.id}/keys/${key.id}`,
      headers: adminHeaders,
    });
    expect(deleteKey.statusCode).toBe(200);

    const providerRes = await app.inject({
      method: "POST",
      url: "/api/providers",
      headers: adminHeaders,
      payload: { name: "Audit Provider", type: "openai", apiKey: "provider-secret-123", defaultModel: "gpt-audit", isPrimary: true },
    });
    expect(providerRes.statusCode).toBe(201);
    const provider = providerRes.json();

    const updateProvider = await app.inject({
      method: "PUT",
      url: `/api/providers/${provider.id}`,
      headers: adminHeaders,
      payload: { defaultModel: "gpt-audit-2", apiKey: "provider-secret-456" },
    });
    expect(updateProvider.statusCode).toBe(200);

    const channelRes = await app.inject({
      method: "POST",
      url: `/api/providers/${provider.id}/channels`,
      headers: adminHeaders,
      payload: { name: "Proxy Channel" },
    });
    expect(channelRes.statusCode).toBe(201);
    const channel = channelRes.json();

    const deleteChannel = await app.inject({
      method: "DELETE",
      url: `/api/providers/${provider.id}/channels/${channel.id}`,
      headers: adminHeaders,
    });
    expect(deleteChannel.statusCode).toBe(200);

    const deleteProvider = await app.inject({
      method: "DELETE",
      url: `/api/providers/${provider.id}`,
      headers: adminHeaders,
    });
    expect(deleteProvider.statusCode).toBe(200);

    const logs = await ctx.db.listAuditLogs(tenant.organization.id);
    expect(logs.map((log) => log.action)).toEqual(expect.arrayContaining([
      "agent.create",
      "api_key.create",
      "api_key.delete",
      "provider.create",
      "provider.update",
      "provider_channel.create",
      "provider_channel.delete",
      "provider.delete",
    ]));
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).not.toContain(initialRawKey);
    expect(serializedLogs).not.toContain(key.rawKey);
    expect(serializedLogs).not.toContain("provider-secret-123");
    expect(serializedLogs).not.toContain("provider-secret-456");
    expect(serializedLogs).not.toContain(channel.rawKey);
  });

  it("should audit HTTP tool and knowledge mutations without headers, body templates, or document content", async () => {
    const toolRes = await app.inject({
      method: "POST",
      url: "/api/http-tools",
      headers: adminHeaders,
      payload: {
        name: "audit_tool",
        url: "https://api.example.com/search",
        method: "POST",
        headers: { authorization: "Bearer http-secret-token" },
        bodyTemplate: "{\"secret\":\"body-secret\"}",
      },
    });
    expect(toolRes.statusCode).toBe(201);
    const tool = toolRes.json();

    const updateTool = await app.inject({
      method: "PUT",
      url: `/api/http-tools/${tool.id}`,
      headers: adminHeaders,
      payload: { enabled: false, headers: { authorization: "Bearer new-http-secret" } },
    });
    expect(updateTool.statusCode).toBe(200);

    const deleteTool = await app.inject({
      method: "DELETE",
      url: `/api/http-tools/${tool.id}`,
      headers: adminHeaders,
    });
    expect(deleteTool.statusCode).toBe(200);

    const kbRes = await app.inject({
      method: "POST",
      url: "/api/knowledge-bases",
      headers: adminHeaders,
      payload: { name: "Audit KB", description: "records only metadata" },
    });
    expect(kbRes.statusCode).toBe(201);
    const kb = kbRes.json();

    const updateKb = await app.inject({
      method: "PUT",
      url: `/api/knowledge-bases/${kb.id}`,
      headers: adminHeaders,
      payload: { name: "Audit KB v2" },
    });
    expect(updateKb.statusCode).toBe(200);

    const sourceContent = "customer private launch plan secret";
    const sourceRes = await app.inject({
      method: "POST",
      url: `/api/knowledge-bases/${kb.id}/sources`,
      headers: adminHeaders,
      payload: { name: "plan.md", content: sourceContent },
    });
    expect(sourceRes.statusCode).toBe(200);

    const updateSource = await app.inject({
      method: "PUT",
      url: `/api/knowledge-bases/${kb.id}/sources/${encodeURIComponent("plan.md")}/content`,
      headers: adminHeaders,
      payload: { content: "updated customer private content" },
    });
    expect(updateSource.statusCode).toBe(200);

    const renameSource = await app.inject({
      method: "PATCH",
      url: `/api/knowledge-bases/${kb.id}/sources/${encodeURIComponent("plan.md")}`,
      headers: adminHeaders,
      payload: { newName: "launch-plan.md" },
    });
    expect(renameSource.statusCode).toBe(200);

    const agent = (await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: adminHeaders,
      payload: { name: "Knowledge Agent", systemPrompt: "test" },
    })).json();

    const setKnowledge = await app.inject({
      method: "PUT",
      url: `/api/agents/${agent.id}/knowledge`,
      headers: adminHeaders,
      payload: { kbIds: [kb.id] },
    });
    expect(setKnowledge.statusCode).toBe(200);

    const deleteSource = await app.inject({
      method: "DELETE",
      url: `/api/knowledge-bases/${kb.id}/sources/${encodeURIComponent("launch-plan.md")}`,
      headers: adminHeaders,
    });
    expect(deleteSource.statusCode).toBe(200);

    const deleteKb = await app.inject({
      method: "DELETE",
      url: `/api/knowledge-bases/${kb.id}`,
      headers: adminHeaders,
    });
    expect(deleteKb.statusCode).toBe(200);

    const logs = await ctx.db.listAuditLogs(tenant.organization.id);
    expect(logs.map((log) => log.action)).toEqual(expect.arrayContaining([
      "http_tool.create",
      "http_tool.update",
      "http_tool.delete",
      "knowledge_base.create",
      "knowledge_base.update",
      "knowledge_source.ingest",
      "knowledge_source.update_content",
      "knowledge_source.rename",
      "agent_knowledge.update",
      "knowledge_source.delete",
      "knowledge_base.delete",
    ]));
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).not.toContain("http-secret-token");
    expect(serializedLogs).not.toContain("new-http-secret");
    expect(serializedLogs).not.toContain("body-secret");
    expect(serializedLogs).not.toContain(sourceContent);
    expect(serializedLogs).not.toContain("updated customer private content");
  });
});
