# AgentForge Commercial Delivery Target

## Goal

Ship AgentForge as a private-cloud enterprise edition that a company can deploy, secure, connect to its identity system, operate, upgrade, evaluate, buy, and accept through customer IT/executive review without custom engineering help on every step.

## Non-Goals

- Do not build a hosted multi-tenant cloud in this pass.
- Do not add billing, payments, or public signup.
- Do not remove `X-Admin-Secret` until automation and emergency-maintenance alternatives are proven.
- Do not claim external security certifications or real SSO tenant approvals without customer-specific evidence.

## Launch Acceptance

- Production deployment preflight blocks unsafe env defaults before a customer goes live.
- Runtime database is PostgreSQL-only: no SQLite/MySQL adapters, scripts, dependencies, or deployment paths remain in active maintenance docs.
- One-command Docker deployment is `docker compose -f docker/docker-compose.yml up --build -d` after copying `.env.example` to `.env` and replacing secrets.
- Browser admin login works with local bootstrap credentials and at least one enterprise SSO path.
- Organization, workspace, member, role, identity provider, and audit log administration is available in the UI.
- RBAC is enforced on admin APIs, not just displayed in the UI.
- Sensitive operations create audit logs with actor, target, and metadata without raw secrets.
- Deployment, backup, restore, upgrade, and rollback docs are explicit enough for private-cloud operators.
- `./scripts/verify.sh` passes without Vite chunk warnings or Node deprecation warnings.
- Real browser smoke covers login, user menu, tenant/member admin, and logout.
- Demo environment can be reset and seeded repeatedly with disposable data.
- Customer IT can review architecture, ports, secrets, identity, database, backup, restore, upgrade, rollback, and smoke steps in one delivery checklist.
- Sales and executives have packaging, pricing-unit, support-tier, and buyer-narrative guidance.

## PostgreSQL-Only Delivery Acceptance

- `DB_TYPE=postgres` is the default and the only accepted runtime database type.
- `docker/docker-compose.yml` starts AgentForge plus PostgreSQL with a persistent `agentforge-postgres` volume.
- `.env.example` contains every required production variable without real secrets.
- `pnpm verify:postgres` initializes schema and verifies tenant, workspace, agent, knowledge, relation, and audit persistence.
- `./scripts/verify.sh` runs build, PostgreSQL-backed tests, PostgreSQL migration smoke, and commercial readiness checks.
- Demo seed/reset/status run successfully against PostgreSQL.
- Docker Compose config renders successfully with `.env.example`; full `docker compose up` requires Docker daemon availability.

## P0 Tasks

1. Done: production deployment preflight and Docker env hardening.
2. Done: OIDC generic SSO for Google Workspace, Microsoft Entra ID, Okta/Auth0/Keycloak, and GitHub Enterprise-style providers.
3. Done: Feishu, WeCom, and DingTalk enterprise login connectors on the same identity-provider model.
4. Done: tenant administration UI for organizations, workspaces, users, memberships, IdPs, and audit logs.
5. Done: RBAC middleware and route tests for owner/admin/builder/viewer.
6. Done: audit coverage for auth, membership, provider, API key, model, tool, and knowledge-base changes.
7. Done: PostgreSQL-only production factory, migration verification, backup/restore, and upgrade runbook.
8. Done: final release smoke, screenshots, README launch guide, and sales demo checklist.
9. Done: commercial readiness matrix, demo reset/seed/status, customer delivery checklist, pricing guide, verification, commit, and push.

## Current Evidence

- Done: tenant data model, workspace scoping, local admin login, session cookies, demo credentials, i18n, warning cleanup.
- Done in this target: `pnpm preflight:prod` production gate with fail/pass tests, Docker env hardening, README launch preflight docs.
- Done in this target: generic OIDC start/callback, state cookie validation, token/userinfo flow, user provisioning, session creation, login-page SSO buttons, audit log, and browser redirect smoke to Google OAuth.
- Done in this target: Feishu, WeCom, and DingTalk OAuth start/callback flows, provider-specific token/userinfo adapters, state cookie validation, user provisioning, session creation, login-page SSO buttons, audit log, and README setup docs.
- Done in this target: Tenants UI route/nav/API wrappers/page for Organization, Workspace, User, Membership, Identity Provider, and Audit Log administration.
- Done in this target: admin API RBAC for logged-in users, with Admin Secret emergency bypass preserved; route tests cover viewer read-only access, builder workspace writes, cross-workspace denial, and admin-only user mutations.
- Done in this target: audit helper and route coverage for local auth, tenant/user/membership/IdP, agent/API key, provider/channel, HTTP tool, and knowledge-base/source changes; tests assert raw secrets and document content stay out of audit metadata.
- Done in this target: PostgreSQL-only runtime database factory, config/preflight checks, Docker Compose PostgreSQL service, migration smoke script, backup/restore scripts, and private-cloud operations runbook.
- Done in this target: release checklist and sales demo path documented in `docs/RELEASE_CHECKLIST.md`, with README and maintenance links.
- Latest verification: `./scripts/verify.sh` passed without Vite chunk size warnings or punycode deprecation warnings; synthetic production `pnpm preflight:prod` with PostgreSQL env passed.
- Latest browser smoke: `http://localhost:5173/tenants` -> login -> lower-left user menu -> create workspace -> create user -> assign member -> create IdP -> audit logs -> logout -> login page; desktop and mobile login screenshots plus desktop audit screenshot saved under `/tmp/agentforge-release-smoke-*.png`, with no console error/warn entries.
- Done in this target: `scripts/demo-data.ts`, `pnpm demo:*` commands, [docs/COMMERCIAL_READINESS.md](docs/COMMERCIAL_READINESS.md), [docs/CUSTOMER_DELIVERY.md](docs/CUSTOMER_DELIVERY.md), [docs/PRICING.md](docs/PRICING.md), and `pnpm verify:commercial` wired into `./scripts/verify.sh`.
- Latest commercial verification: disposable PostgreSQL demo DB passed `demo:status -> demo:seed -> demo:status -> demo:reset -> demo:status`; `./scripts/verify.sh` passed with build, tests, and commercial readiness checks.
- Latest PostgreSQL-only verification: `./scripts/verify.sh` passed; `docker compose --env-file .env.example -f docker/docker-compose.yml config` rendered AgentForge + PostgreSQL successfully. Full Docker runtime smoke was blocked locally because Docker daemon was not running.
