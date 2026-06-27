# AgentForge Private-Cloud Launch Target

## Goal

Ship AgentForge as a private-cloud enterprise edition that a company can deploy, secure, connect to its identity system, operate, upgrade, and evaluate without engineering help from us on every step.

## Non-Goals

- Do not build a hosted multi-tenant cloud in this pass.
- Do not add billing, payments, or public signup.
- Do not remove `X-Admin-Secret` until automation and emergency-maintenance alternatives are proven.

## Launch Acceptance

- Production deployment preflight blocks unsafe env defaults before a customer goes live.
- Browser admin login works with local bootstrap credentials and at least one enterprise SSO path.
- Organization, workspace, member, role, identity provider, and audit log administration is available in the UI.
- RBAC is enforced on admin APIs, not just displayed in the UI.
- Sensitive operations create audit logs with actor, target, and metadata without raw secrets.
- Deployment, backup, restore, upgrade, and rollback docs are explicit enough for private-cloud operators.
- `./scripts/verify.sh` passes without Vite chunk warnings or Node deprecation warnings.
- Real browser smoke covers login, user menu, tenant/member admin, and logout.

## P0 Tasks

1. Done: production deployment preflight and Docker env hardening.
2. Done: OIDC generic SSO for Google Workspace, Microsoft Entra ID, Okta/Auth0/Keycloak, and GitHub Enterprise-style providers.
3. Done: Feishu, WeCom, and DingTalk enterprise login connectors on the same identity-provider model.
4. Pending: tenant administration UI for organizations, workspaces, users, memberships, IdPs, and audit logs.
5. Done: RBAC middleware and route tests for owner/admin/builder/viewer.
6. Pending: audit coverage for auth, membership, provider, API key, model, tool, and knowledge-base changes.
7. Pending: MySQL production factory, migration verification, backup/restore, and upgrade runbook.
8. Pending: final release smoke, screenshots, README launch guide, and sales demo checklist.

## Current Evidence

- Done: tenant data model, workspace scoping, local admin login, session cookies, demo credentials, i18n, warning cleanup.
- Done in this target: `pnpm preflight:prod` production gate with fail/pass tests, Docker env hardening, README launch preflight docs.
- Done in this target: generic OIDC start/callback, state cookie validation, token/userinfo flow, user provisioning, session creation, login-page SSO buttons, audit log, and browser redirect smoke to Google OAuth.
- Done in this target: Feishu, WeCom, and DingTalk OAuth start/callback flows, provider-specific token/userinfo adapters, state cookie validation, user provisioning, session creation, login-page SSO buttons, audit log, and README setup docs.
- Done in this target: admin API RBAC for logged-in users, with Admin Secret emergency bypass preserved; route tests cover viewer read-only access, builder workspace writes, cross-workspace denial, and admin-only user mutations.
- Latest verification: `./scripts/verify.sh` passed without Vite chunk size warnings or punycode deprecation warnings.
- Latest browser smoke: `http://localhost:5173/login` -> demo login -> dashboard -> left-bottom user menu -> logout -> login page; login page shows Google Workspace + Feishu SSO, Feishu button redirects to `/api/auth/oauth/:providerId/start` and then the Feishu authorization URL, with no console error/warn entries.
