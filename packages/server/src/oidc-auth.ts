import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { IdentityProviderConfig, UserAccount } from "@agentforge/types";
import type { AppContext } from "./bootstrap.js";
import { appendSetCookie, createUserSession, setSessionCookie } from "./local-auth.js";

const OIDC_STATE_COOKIE = "agentforge_oidc_state";
const OIDC_SCOPE = "openid email profile";

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
}

interface OidcState {
  state: string;
  providerId: string;
  redirectTo: string;
}

interface OidcUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  picture?: string;
}

export async function startOidcLogin(request: FastifyRequest, reply: FastifyReply, ctx: AppContext, providerId: string, redirectTo = "/"): Promise<void> {
  const provider = await findOidcProvider(ctx, providerId);
  if (!provider) {
    reply.code(404).send({ error: "OIDC provider not found" });
    return;
  }

  const discovery = await discoverOidc(provider);
  const state = randomBytes(24).toString("base64url");
  setOidcStateCookie(reply, { state, providerId, redirectTo: normalizeRedirect(redirectTo) });

  const authorizeUrl = new URL(discovery.authorization_endpoint);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", provider.clientId!);
  authorizeUrl.searchParams.set("redirect_uri", oidcRedirectUri(request, ctx, provider.id));
  authorizeUrl.searchParams.set("scope", OIDC_SCOPE);
  authorizeUrl.searchParams.set("state", state);
  reply.redirect(authorizeUrl.toString());
}

export async function listOidcLoginProviders(ctx: AppContext): Promise<Array<{ id: string; name: string; provider: string }>> {
  const result: Array<{ id: string; name: string; provider: string }> = [];
  for (const organization of await ctx.db.listOrganizations()) {
    for (const provider of await ctx.db.listIdentityProviders(organization.id)) {
      if (provider.enabled && provider.type === "oidc" && provider.issuerUrl && provider.clientId && provider.clientSecretRef) {
        result.push({ id: provider.id, name: provider.name, provider: provider.provider });
      }
    }
  }
  return result;
}

export async function finishOidcLogin(request: FastifyRequest, reply: FastifyReply, ctx: AppContext, providerId: string): Promise<void> {
  const query = request.query as { code?: string; state?: string; error?: string };
  if (query.error) {
    reply.code(401).send({ error: query.error });
    return;
  }
  if (!query.code || !query.state) {
    reply.code(400).send({ error: "code and state are required" });
    return;
  }

  const state = readOidcStateCookie(request);
  clearOidcStateCookie(reply);
  if (!state || state.state !== query.state || state.providerId !== providerId) {
    reply.code(401).send({ error: "Invalid OIDC state" });
    return;
  }

  const provider = await findOidcProvider(ctx, providerId);
  if (!provider) {
    reply.code(404).send({ error: "OIDC provider not found" });
    return;
  }

  const discovery = await discoverOidc(provider);
  const token = await exchangeCodeForToken(provider, discovery, query.code, oidcRedirectUri(request, ctx, provider.id));
  const profile = await loadUserInfo(discovery, token.access_token);
  const user = await upsertOidcUser(ctx, provider, profile, request);
  const session = await createUserSession(ctx, user);
  setSessionCookie(reply, session.token, ctx.config.sessionTtlDays * 24 * 60 * 60);
  reply.redirect(state.redirectTo);
}

async function findOidcProvider(ctx: AppContext, providerId: string): Promise<IdentityProviderConfig | null> {
  for (const organization of await ctx.db.listOrganizations()) {
    const provider = (await ctx.db.listIdentityProviders(organization.id)).find((item) => item.id === providerId);
    if (provider?.enabled && provider.type === "oidc" && provider.issuerUrl && provider.clientId && provider.clientSecretRef) {
      return provider;
    }
  }
  return null;
}

async function discoverOidc(provider: IdentityProviderConfig): Promise<OidcDiscovery> {
  const issuer = provider.issuerUrl!.replace(/\/$/, "");
  const res = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const discovery = await res.json() as Partial<OidcDiscovery>;
  if (!discovery.authorization_endpoint || !discovery.token_endpoint) {
    throw new Error("OIDC discovery document is missing required endpoints");
  }
  return discovery as OidcDiscovery;
}

async function exchangeCodeForToken(provider: IdentityProviderConfig, discovery: OidcDiscovery, code: string, redirectUri: string): Promise<{ access_token: string }> {
  const secret = resolveSecretRef(provider.clientSecretRef!);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: provider.clientId!,
    client_secret: secret,
  });
  const res = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`OIDC token exchange failed: ${res.status}`);
  const token = await res.json() as { access_token?: string };
  if (!token.access_token) throw new Error("OIDC token response is missing access_token");
  return { access_token: token.access_token };
}

async function loadUserInfo(discovery: OidcDiscovery, accessToken: string): Promise<OidcUserInfo> {
  if (!discovery.userinfo_endpoint) throw new Error("OIDC discovery document is missing userinfo_endpoint");
  const res = await fetch(discovery.userinfo_endpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`OIDC userinfo failed: ${res.status}`);
  const profile = await res.json() as OidcUserInfo;
  if (!profile.email?.trim()) throw new Error("OIDC userinfo is missing email");
  if (profile.email_verified === false) throw new Error("OIDC user email is not verified");
  return profile;
}

async function upsertOidcUser(ctx: AppContext, provider: IdentityProviderConfig, profile: OidcUserInfo, request: FastifyRequest): Promise<UserAccount> {
  const email = profile.email!.trim().toLowerCase();
  const displayName = profile.name?.trim() || profile.preferred_username?.trim() || email.split("@")[0];
  let user = await ctx.db.getUserByEmail(email);
  if (!user) {
    user = await ctx.db.createUser({ email, displayName, avatarUrl: profile.picture });
  }

  const workspaces = await ctx.db.listWorkspaces(provider.organizationId);
  const workspace = workspaces[0] ?? await ctx.db.createWorkspace({ organizationId: provider.organizationId, name: "Default Workspace", slug: "default" });
  const memberships = await ctx.db.listMemberships(provider.organizationId);
  if (!memberships.some((membership) => membership.userId === user.id && membership.workspaceId === null && membership.status === "active")) {
    await ctx.db.upsertMembership({
      organizationId: provider.organizationId,
      workspaceId: null,
      userId: user.id,
      role: "viewer",
      status: "active",
    });
  }
  if (!memberships.some((membership) => membership.userId === user.id && membership.workspaceId === workspace.id && membership.status === "active")) {
    await ctx.db.upsertMembership({
      organizationId: provider.organizationId,
      workspaceId: workspace.id,
      userId: user.id,
      role: "viewer",
      status: "active",
    });
  }
  await ctx.db.createAuditLog({
    organizationId: provider.organizationId,
    workspaceId: workspace.id,
    actorUserId: user.id,
    action: "auth.oidc_login",
    resourceType: "identity_provider",
    resourceId: provider.id,
    metadata: { email, provider: provider.provider, subject: profile.sub },
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"],
  });
  return user;
}

function resolveSecretRef(secretRef: string): string {
  if (!secretRef.startsWith("env:")) throw new Error("Only env: OIDC client secret references are supported");
  const envName = secretRef.slice(4);
  const value = process.env[envName];
  if (!value) throw new Error(`Missing OIDC client secret env var: ${envName}`);
  return value;
}

function oidcRedirectUri(request: FastifyRequest, ctx: AppContext, providerId: string): string {
  const base = ctx.config.publicUrl || `${request.protocol}://${request.headers.host}`;
  return `${base.replace(/\/$/, "")}/api/auth/oidc/${providerId}/callback`;
}

function setOidcStateCookie(reply: FastifyReply, state: OidcState): void {
  const secure = process.env.AUTH_COOKIE_SECURE === "true" ? "; Secure" : "";
  const value = Buffer.from(JSON.stringify(state)).toString("base64url");
  appendSetCookie(reply, `${OIDC_STATE_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
}

function readOidcStateCookie(request: FastifyRequest): OidcState | null {
  const cookie = request.headers.cookie;
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rawValue] = part.trim().split("=");
    if (name !== OIDC_STATE_COOKIE) continue;
    try {
      return JSON.parse(Buffer.from(decodeURIComponent(rawValue.join("=")), "base64url").toString("utf8")) as OidcState;
    } catch {
      return null;
    }
  }
  return null;
}

function clearOidcStateCookie(reply: FastifyReply): void {
  appendSetCookie(reply, `${OIDC_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function normalizeRedirect(redirectTo: string): string {
  return redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/";
}
