# P0 Enterprise Tenant Foundation

## Goal

Build the first SaaS/private-cloud foundation for AgentForge: organizations, workspaces, users, memberships, identity provider configuration, and audit logs.
Scope core runtime data to workspaces so private-cloud deployments do not mix tenant data.

## Non-Goals

- Do not implement OIDC, SAML, Feishu, WeCom, DingTalk, Google, Microsoft, or GitHub login flows in this pass.
- Do not change the current `X-Admin-Secret` admin path until the tenant foundation is proven.

## Acceptance

- SQLite and MySQL schemas contain tenant foundation tables and indexes.
- `DatabaseAdapter` exposes typed methods for organizations, workspaces, users, memberships, identity providers, and audit logs.
- Agent, Provider/Channel, HTTP Tool, Skill Category, Knowledge Base, Session, Usage, and Proxy Usage operations are scoped by workspace.
- SQLite tests prove default tenant bootstrapping is idempotent, membership roles persist, identity provider config is stored without raw secrets, and audit logs are queryable.
- SQLite tests prove workspace isolation for core runtime data.
- Admin API supports `X-Workspace-Id`, `workspaceId` query, or `workspaceId` body selection, with default workspace fallback.
- Admin route tests prove cross-workspace resource access returns 404.
- Admin API exposes tenant foundation read/create endpoints for the next UI/auth work.
- `./scripts/verify.sh` passes.

## P0 Backlog

1. Done: tenant data model, identity provider config abstraction, admin API, audit log base.
2. Done: workspace scoping migration for Agents, Tools, Skill Categories, Providers, Channels, Knowledge Bases, Sessions, Usage, and Proxy Usage.
3. Auth runtime: local admin, OIDC, SAML.
4. China connectors: Feishu first, then WeCom and DingTalk.
5. Global connectors: Microsoft Entra ID, Google Workspace, Okta/Auth0/Keycloak via OIDC/SAML; GitHub as optional developer login.
6. Frontend workspace switcher and tenant administration screens.
