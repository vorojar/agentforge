import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { IdentityProviderConfig, UserAccount } from "@agentforge/types";
import type { AppContext } from "./bootstrap.js";
import { appendSetCookie, createUserSession, setSessionCookie } from "./local-auth.js";

const OAUTH_STATE_COOKIE = "agentforge_oauth_state";
const SUPPORTED_PROVIDERS = new Set(["feishu", "wecom", "dingtalk"]);

interface OAuthState {
  state: string;
  providerId: string;
  redirectTo: string;
}

interface EnterpriseProfile {
  subject: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
}

export async function listEnterpriseOAuthLoginProviders(ctx: AppContext): Promise<Array<{ id: string; name: string; provider: string }>> {
  const result: Array<{ id: string; name: string; provider: string }> = [];
  for (const organization of await ctx.db.listOrganizations()) {
    for (const provider of await ctx.db.listIdentityProviders(organization.id)) {
      if (isUsableEnterpriseProvider(provider)) {
        result.push({ id: provider.id, name: provider.name, provider: provider.provider });
      }
    }
  }
  return result;
}

export async function startEnterpriseOAuthLogin(request: FastifyRequest, reply: FastifyReply, ctx: AppContext, providerId: string, redirectTo = "/"): Promise<void> {
  const provider = await findEnterpriseProvider(ctx, providerId);
  if (!provider) {
    reply.code(404).send({ error: "OAuth provider not found" });
    return;
  }

  const state = randomBytes(24).toString("base64url");
  setOAuthStateCookie(reply, { state, providerId, redirectTo: normalizeRedirect(redirectTo) });
  reply.redirect(authorizationUrl(provider, enterpriseRedirectUri(request, ctx, provider.id), state).toString());
}

export async function finishEnterpriseOAuthLogin(request: FastifyRequest, reply: FastifyReply, ctx: AppContext, providerId: string): Promise<void> {
  const query = request.query as { code?: string; auth_code?: string; state?: string; error?: string };
  const code = query.code || query.auth_code;
  if (query.error) {
    reply.code(401).send({ error: query.error });
    return;
  }
  if (!code || !query.state) {
    reply.code(400).send({ error: "code and state are required" });
    return;
  }

  const state = readOAuthStateCookie(request);
  clearOAuthStateCookie(reply);
  if (!state || state.state !== query.state || state.providerId !== providerId) {
    reply.code(401).send({ error: "Invalid OAuth state" });
    return;
  }

  const provider = await findEnterpriseProvider(ctx, providerId);
  if (!provider) {
    reply.code(404).send({ error: "OAuth provider not found" });
    return;
  }

  const profile = await loadEnterpriseProfile(provider, code, enterpriseRedirectUri(request, ctx, provider.id));
  const user = await upsertEnterpriseUser(ctx, provider, profile, request);
  const session = await createUserSession(ctx, user);
  setSessionCookie(reply, session.token, ctx.config.sessionTtlDays * 24 * 60 * 60);
  reply.redirect(state.redirectTo);
}

async function findEnterpriseProvider(ctx: AppContext, providerId: string): Promise<IdentityProviderConfig | null> {
  for (const organization of await ctx.db.listOrganizations()) {
    const provider = (await ctx.db.listIdentityProviders(organization.id)).find((item) => item.id === providerId);
    if (provider && isUsableEnterpriseProvider(provider)) return provider;
  }
  return null;
}

function isUsableEnterpriseProvider(provider: IdentityProviderConfig): boolean {
  return provider.enabled &&
    provider.type === "oauth" &&
    SUPPORTED_PROVIDERS.has(provider.provider) &&
    Boolean(provider.clientId && provider.clientSecretRef) &&
    (provider.provider !== "wecom" || Boolean(provider.claimMapping.agentId));
}

function authorizationUrl(provider: IdentityProviderConfig, redirectUri: string, state: string): URL {
  if (provider.provider === "wecom") {
    const agentId = provider.claimMapping.agentId;
    if (!agentId) throw new Error("WeCom OAuth requires claimMapping.agentId");
    const url = new URL(provider.ssoUrl || "https://open.work.weixin.qq.com/wwopen/sso/qrConnect");
    url.searchParams.set("appid", provider.clientId!);
    url.searchParams.set("agentid", agentId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url;
  }

  const url = new URL(provider.ssoUrl || defaultAuthorizationEndpoint(provider.provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", provider.clientId!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  if (provider.provider === "dingtalk") {
    url.searchParams.set("scope", provider.claimMapping.scope || "openid");
    url.searchParams.set("prompt", "consent");
  } else {
    url.searchParams.set("scope", provider.claimMapping.scope || "contact:user.email");
  }
  return url;
}

function defaultAuthorizationEndpoint(provider: string): string {
  if (provider === "feishu") return "https://accounts.feishu.cn/open-apis/authen/v1/authorize";
  if (provider === "dingtalk") return "https://login.dingtalk.com/oauth2/auth";
  throw new Error(`Unsupported OAuth provider: ${provider}`);
}

async function loadEnterpriseProfile(provider: IdentityProviderConfig, code: string, redirectUri: string): Promise<EnterpriseProfile> {
  if (provider.provider === "feishu") return await loadFeishuProfile(provider, code, redirectUri);
  if (provider.provider === "wecom") return await loadWeComProfile(provider, code);
  if (provider.provider === "dingtalk") return await loadDingTalkProfile(provider, code);
  throw new Error(`Unsupported OAuth provider: ${provider.provider}`);
}

async function loadFeishuProfile(provider: IdentityProviderConfig, code: string, redirectUri: string): Promise<EnterpriseProfile> {
  const tokenRes = await fetch(provider.issuerUrl || "https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: provider.clientId!,
      client_secret: resolveSecretRef(provider.clientSecretRef!, "Feishu"),
    }),
  });
  if (!tokenRes.ok) throw new Error(`Feishu token exchange failed: ${tokenRes.status}`);
  const tokenBody = await tokenRes.json() as { access_token?: string; user_access_token?: string; data?: { access_token?: string; user_access_token?: string } };
  const accessToken = tokenBody.data?.access_token || tokenBody.data?.user_access_token || tokenBody.access_token || tokenBody.user_access_token;
  if (!accessToken) throw new Error("Feishu token response is missing access token");

  const profileRes = await fetch("https://open.feishu.cn/open-apis/authen/v1/user_info", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) throw new Error(`Feishu userinfo failed: ${profileRes.status}`);
  const body = await profileRes.json() as { data?: Record<string, unknown> };
  const data = body.data ?? {};
  const subject = stringValue(data.open_id) || stringValue(data.union_id);
  if (!subject) throw new Error("Feishu userinfo is missing open_id");
  return {
    subject,
    email: stringValue(data.email) || stringValue(data.enterprise_email),
    displayName: stringValue(data.name) || stringValue(data.en_name),
    avatarUrl: stringValue(data.avatar_url),
  };
}

async function loadWeComProfile(provider: IdentityProviderConfig, code: string): Promise<EnterpriseProfile> {
  const secret = resolveSecretRef(provider.clientSecretRef!, "WeCom");
  const tokenUrl = new URL("https://qyapi.weixin.qq.com/cgi-bin/gettoken");
  tokenUrl.searchParams.set("corpid", provider.clientId!);
  tokenUrl.searchParams.set("corpsecret", secret);
  const tokenRes = await fetch(tokenUrl);
  if (!tokenRes.ok) throw new Error(`WeCom access token failed: ${tokenRes.status}`);
  const tokenBody = await tokenRes.json() as { errcode?: number; errmsg?: string; access_token?: string };
  if (tokenBody.errcode && tokenBody.errcode !== 0) throw new Error(`WeCom access token failed: ${tokenBody.errmsg || tokenBody.errcode}`);
  if (!tokenBody.access_token) throw new Error("WeCom token response is missing access_token");

  const userInfoUrl = new URL("https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo");
  userInfoUrl.searchParams.set("access_token", tokenBody.access_token);
  userInfoUrl.searchParams.set("code", code);
  const userInfoRes = await fetch(userInfoUrl);
  if (!userInfoRes.ok) throw new Error(`WeCom getuserinfo failed: ${userInfoRes.status}`);
  const userInfo = await userInfoRes.json() as { errcode?: number; errmsg?: string; UserId?: string; userid?: string; user_ticket?: string };
  if (userInfo.errcode && userInfo.errcode !== 0) throw new Error(`WeCom getuserinfo failed: ${userInfo.errmsg || userInfo.errcode}`);
  const subject = userInfo.UserId || userInfo.userid;
  if (!subject) throw new Error("WeCom getuserinfo is missing UserId");

  const detail = userInfo.user_ticket ? await loadWeComUserDetail(tokenBody.access_token, userInfo.user_ticket) : {};
  return {
    subject,
    email: stringValue(detail.biz_mail) || stringValue(detail.email),
    displayName: stringValue(detail.name) || subject,
    avatarUrl: stringValue(detail.avatar),
  };
}

async function loadWeComUserDetail(accessToken: string, userTicket: string): Promise<Record<string, unknown>> {
  const detailUrl = new URL("https://qyapi.weixin.qq.com/cgi-bin/auth/getuserdetail");
  detailUrl.searchParams.set("access_token", accessToken);
  const res = await fetch(detailUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_ticket: userTicket }),
  });
  if (!res.ok) throw new Error(`WeCom getuserdetail failed: ${res.status}`);
  const body = await res.json() as Record<string, unknown> & { errcode?: number; errmsg?: string };
  if (body.errcode && body.errcode !== 0) throw new Error(`WeCom getuserdetail failed: ${body.errmsg || body.errcode}`);
  return body;
}

async function loadDingTalkProfile(provider: IdentityProviderConfig, code: string): Promise<EnterpriseProfile> {
  const tokenRes = await fetch(provider.issuerUrl || "https://api.dingtalk.com/v1.0/oauth2/userAccessToken", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: provider.clientId!,
      clientSecret: resolveSecretRef(provider.clientSecretRef!, "DingTalk"),
      code,
      grantType: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new Error(`DingTalk token exchange failed: ${tokenRes.status}`);
  const tokenBody = await tokenRes.json() as { accessToken?: string; access_token?: string };
  const accessToken = tokenBody.accessToken || tokenBody.access_token;
  if (!accessToken) throw new Error("DingTalk token response is missing accessToken");

  const profileRes = await fetch("https://api.dingtalk.com/v1.0/contact/users/me", {
    headers: { "x-acs-dingtalk-access-token": accessToken },
  });
  if (!profileRes.ok) throw new Error(`DingTalk userinfo failed: ${profileRes.status}`);
  const data = await profileRes.json() as Record<string, unknown>;
  const subject = stringValue(data.unionId) || stringValue(data.openId) || stringValue(data.userid);
  if (!subject) throw new Error("DingTalk userinfo is missing unionId");
  return {
    subject,
    email: stringValue(data.email),
    displayName: stringValue(data.nick) || stringValue(data.name),
    avatarUrl: stringValue(data.avatarUrl),
  };
}

async function upsertEnterpriseUser(ctx: AppContext, provider: IdentityProviderConfig, profile: EnterpriseProfile, request: FastifyRequest): Promise<UserAccount> {
  const email = resolveProfileEmail(provider, profile).toLowerCase();
  const displayName = profile.displayName?.trim() || email.split("@")[0];
  let user = await ctx.db.getUserByEmail(email);
  if (!user) {
    user = await ctx.db.createUser({ email, displayName, avatarUrl: profile.avatarUrl });
  }

  const workspaces = await ctx.db.listWorkspaces(provider.organizationId);
  const workspace = workspaces[0] ?? await ctx.db.createWorkspace({ organizationId: provider.organizationId, name: "Default Workspace", slug: "default" });
  const memberships = await ctx.db.listMemberships(provider.organizationId);
  if (!memberships.some((membership) => membership.userId === user.id && membership.workspaceId === null && membership.status === "active")) {
    await ctx.db.upsertMembership({ organizationId: provider.organizationId, workspaceId: null, userId: user.id, role: "viewer", status: "active" });
  }
  if (!memberships.some((membership) => membership.userId === user.id && membership.workspaceId === workspace.id && membership.status === "active")) {
    await ctx.db.upsertMembership({ organizationId: provider.organizationId, workspaceId: workspace.id, userId: user.id, role: "viewer", status: "active" });
  }
  await ctx.db.createAuditLog({
    organizationId: provider.organizationId,
    workspaceId: workspace.id,
    actorUserId: user.id,
    action: "auth.oauth_login",
    resourceType: "identity_provider",
    resourceId: provider.id,
    metadata: { email, provider: provider.provider, subject: profile.subject },
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"],
  });
  return user;
}

function resolveProfileEmail(provider: IdentityProviderConfig, profile: EnterpriseProfile): string {
  const email = profile.email?.trim();
  if (email) return email;
  const emailDomain = provider.claimMapping.emailDomain?.trim();
  if (!emailDomain) throw new Error(`${provider.provider} profile is missing email; set claimMapping.emailDomain to derive one from the provider user id`);
  return `${profile.subject.toLowerCase().replace(/[^a-z0-9._-]+/g, "-")}@${emailDomain}`;
}

function resolveSecretRef(secretRef: string, label: string): string {
  if (!secretRef.startsWith("env:")) throw new Error(`Only env: ${label} client secret references are supported`);
  const envName = secretRef.slice(4);
  const value = process.env[envName];
  if (!value) throw new Error(`Missing ${label} client secret env var: ${envName}`);
  return value;
}

function enterpriseRedirectUri(request: FastifyRequest, ctx: AppContext, providerId: string): string {
  const base = ctx.config.publicUrl || `${request.protocol}://${request.headers.host}`;
  return `${base.replace(/\/$/, "")}/api/auth/oauth/${providerId}/callback`;
}

function setOAuthStateCookie(reply: FastifyReply, state: OAuthState): void {
  const secure = process.env.AUTH_COOKIE_SECURE === "true" ? "; Secure" : "";
  const value = Buffer.from(JSON.stringify(state)).toString("base64url");
  appendSetCookie(reply, `${OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
}

function readOAuthStateCookie(request: FastifyRequest): OAuthState | null {
  const cookie = request.headers.cookie;
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rawValue] = part.trim().split("=");
    if (name !== OAUTH_STATE_COOKIE) continue;
    try {
      return JSON.parse(Buffer.from(decodeURIComponent(rawValue.join("=")), "base64url").toString("utf8")) as OAuthState;
    } catch {
      return null;
    }
  }
  return null;
}

function clearOAuthStateCookie(reply: FastifyReply): void {
  appendSetCookie(reply, `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function normalizeRedirect(redirectTo: string): string {
  return redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
