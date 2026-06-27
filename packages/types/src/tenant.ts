export type OrganizationRole = "owner" | "admin" | "builder" | "viewer";
export type MembershipStatus = "active" | "invited" | "disabled";
export type IdentityProviderType = "local" | "oidc" | "saml" | "oauth";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationCreateInput {
  name: string;
  slug?: string;
}

export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceCreateInput {
  organizationId: string;
  name: string;
  slug?: string;
}

export interface UserAccount {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserCreateInput {
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface Membership {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  userId: string;
  role: OrganizationRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipInput {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  workspaceId?: string | null;
  status?: MembershipStatus;
}

export interface IdentityProviderConfig {
  id: string;
  organizationId: string;
  type: IdentityProviderType;
  provider: string;
  name: string;
  issuerUrl?: string;
  clientId?: string;
  clientSecretRef?: string;
  ssoUrl?: string;
  certificate?: string;
  claimMapping: Record<string, string>;
  groupMapping: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityProviderCreateInput {
  organizationId: string;
  type: IdentityProviderType;
  provider: string;
  name: string;
  issuerUrl?: string;
  clientId?: string;
  clientSecretRef?: string;
  ssoUrl?: string;
  certificate?: string;
  claimMapping?: Record<string, string>;
  groupMapping?: Record<string, string>;
  enabled?: boolean;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AuditLogInput {
  organizationId: string;
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface TenantBootstrapResult {
  organization: Organization;
  workspace: Workspace;
}
