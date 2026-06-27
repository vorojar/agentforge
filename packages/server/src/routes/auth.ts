import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";
import {
  clearSessionCookie,
  ensureLocalAdmin,
  loginLocalUser,
  logoutCurrentUser,
  resolveCurrentUser,
  setSessionCookie,
} from "../local-auth.js";
import { finishOidcLogin, listOidcLoginProviders, startOidcLogin } from "../oidc-auth.js";
import { finishEnterpriseOAuthLogin, listEnterpriseOAuthLoginProviders, startEnterpriseOAuthLogin } from "../enterprise-oauth.js";
import { recordUserMembershipAuditLogs } from "../audit.js";

export async function authRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { ctx } = opts;

  fastify.get("/api/auth/bootstrap", async () => {
    const user = await ensureLocalAdmin(ctx);
    return {
      loginEnabled: true,
      defaultWorkspaceId: user.memberships.find((membership) => membership.workspaceId)?.workspaceId ?? null,
      oidcProviders: await listOidcLoginProviders(ctx),
      oauthProviders: await listEnterpriseOAuthLoginProviders(ctx),
    };
  });

  fastify.post("/api/auth/login", async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    if (!body.email?.trim() || !body.password) {
      return reply.code(400).send({ error: "email and password are required" });
    }

    const result = await loginLocalUser(ctx, body.email, body.password);
    if (!result) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    await recordUserMembershipAuditLogs(ctx.db, request, result.user, "auth.local_login", { email: result.user.email });
    setSessionCookie(reply, result.token, ctx.config.sessionTtlDays * 24 * 60 * 60);
    return { user: result.user, expiresAt: result.expiresAt };
  });

  fastify.get("/api/auth/me", async (request, reply) => {
    const user = await resolveCurrentUser(request, ctx);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    return { user };
  });

  fastify.post("/api/auth/logout", async (request, reply) => {
    const user = await resolveCurrentUser(request, ctx);
    await logoutCurrentUser(request, ctx);
    if (user) await recordUserMembershipAuditLogs(ctx.db, request, user, "auth.logout", { email: user.email });
    clearSessionCookie(reply);
    return { ok: true };
  });

  fastify.get("/api/auth/oidc/:providerId/start", async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const { redirect } = request.query as { redirect?: string };
    await startOidcLogin(request, reply, ctx, providerId, redirect);
  });

  fastify.get("/api/auth/oidc/:providerId/callback", async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    await finishOidcLogin(request, reply, ctx, providerId);
  });

  fastify.get("/api/auth/oauth/:providerId/start", async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const { redirect } = request.query as { redirect?: string };
    await startEnterpriseOAuthLogin(request, reply, ctx, providerId, redirect);
  });

  fastify.get("/api/auth/oauth/:providerId/callback", async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    await finishEnterpriseOAuthLogin(request, reply, ctx, providerId);
  });
}
