import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthenticatedUser, DatabaseAdapter, Membership, UserAccount } from "@agentforge/types";
import type { AppContext } from "./bootstrap.js";

const COOKIE_NAME = "agentforge_session";
const HASH_PREFIX = "scrypt$v1";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const derived = scryptSync(password, salt, 64).toString("base64url");
  return `${HASH_PREFIX}$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [prefix, version, salt, hash] = storedHash.split("$");
  if (`${prefix}$${version}` !== HASH_PREFIX || !salt || !hash) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64).toString("base64url"));
  const expected = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function ensureLocalAdmin(ctx: AppContext): Promise<AuthenticatedUser> {
  const tenant = await ctx.db.ensureDefaultTenant();
  const email = ctx.config.adminEmail.trim().toLowerCase();
  const displayName = email.split("@")[0] || "admin";
  let user = await ctx.db.getUserByEmail(email);
  if (!user) {
    user = await ctx.db.createUser({ email, displayName });
  }

  const password = await ctx.db.getUserPassword(user.id);
  if (!password) {
    await ctx.db.setUserPassword(user.id, hashPassword(ctx.config.adminPassword));
  }

  await ctx.db.upsertMembership({
    organizationId: tenant.organization.id,
    userId: user.id,
    workspaceId: null,
    role: "owner",
    status: "active",
  });
  await ctx.db.upsertMembership({
    organizationId: tenant.organization.id,
    userId: user.id,
    workspaceId: tenant.workspace.id,
    role: "owner",
    status: "active",
  });
  await ctx.db.deleteExpiredAuthSessions();

  return await toAuthenticatedUser(ctx.db, user);
}

export async function loginLocalUser(ctx: AppContext, email: string, password: string): Promise<{ user: AuthenticatedUser; token: string; expiresAt: string } | null> {
  await ensureLocalAdmin(ctx);
  const user = await ctx.db.getUserByEmail(email.trim().toLowerCase());
  if (!user) return null;

  const storedPassword = await ctx.db.getUserPassword(user.id);
  if (!storedPassword || !verifyPassword(password, storedPassword.passwordHash)) return null;

  return await createUserSession(ctx, user);
}

export async function createUserSession(ctx: AppContext, user: UserAccount): Promise<{ user: AuthenticatedUser; token: string; expiresAt: string }> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + ctx.config.sessionTtlDays * 24 * 60 * 60 * 1000).toISOString();
  await ctx.db.createAuthSession(user.id, hashSessionToken(token), expiresAt);
  await ctx.db.updateUserLastLogin(user.id);
  return { user: await toAuthenticatedUser(ctx.db, user), token, expiresAt };
}

export async function resolveCurrentUser(request: FastifyRequest, ctx: AppContext): Promise<AuthenticatedUser | null> {
  const token = readSessionCookie(request);
  if (!token) return null;
  const session = await ctx.db.getAuthSessionByHash(hashSessionToken(token));
  if (!session) return null;
  const user = await ctx.db.getUser(session.userId);
  return user ? await toAuthenticatedUser(ctx.db, user) : null;
}

export async function logoutCurrentUser(request: FastifyRequest, ctx: AppContext): Promise<void> {
  const token = readSessionCookie(request);
  if (token) await ctx.db.deleteAuthSessionByHash(hashSessionToken(token));
}

export function setSessionCookie(reply: FastifyReply, token: string, maxAgeSeconds: number): void {
  const secure = process.env.AUTH_COOKIE_SECURE === "true" ? "; Secure" : "";
  appendSetCookie(reply, `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

export function clearSessionCookie(reply: FastifyReply): void {
  appendSetCookie(reply, `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function readSessionCookie(request: FastifyRequest): string | null {
  const cookie = request.headers.cookie;
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === COOKIE_NAME) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return null;
}

async function toAuthenticatedUser(db: DatabaseAdapter, user: UserAccount): Promise<AuthenticatedUser> {
  const organizations = await db.listOrganizations();
  const memberships: Membership[] = [];
  for (const organization of organizations) {
    memberships.push(...await db.listMemberships(organization.id));
  }
  return { ...user, memberships: memberships.filter((membership) => membership.userId === user.id) };
}

export function appendSetCookie(reply: FastifyReply, cookie: string): void {
  const existing = reply.getHeader("Set-Cookie");
  if (!existing) {
    reply.header("Set-Cookie", cookie);
  } else if (Array.isArray(existing)) {
    reply.header("Set-Cookie", [...existing, cookie]);
  } else {
    reply.header("Set-Cookie", [String(existing), cookie]);
  }
}
