# AgentForge Release Checklist

Use this checklist before packaging a private-cloud customer release or running a sales demo.

## Launch Gate

Release is ready only when every item is true:

1. `./scripts/verify.sh` passes from the repository root.
2. `NODE_ENV=production pnpm preflight:prod` passes in the target environment.
3. Production uses `DB_TYPE=postgres` or an equivalent PostgreSQL URL.
4. `pnpm verify:postgres` passes against staging or the target database.
5. `pnpm backup:postgres` produces a restorable `.sql.gz` backup outside the app container.
6. Browser smoke passes: login, user menu, Enterprise Settings, membership, enterprise login, audit log, and logout.
7. Browser console has no new `error` or `warning` entries during the smoke path.
8. At least one enterprise identity provider path is configured or scheduled with the customer.
9. Rollback plan points to a previous image/commit and a pre-upgrade database backup.
10. Commercial readiness docs are current: [COMMERCIAL_READINESS.md](COMMERCIAL_READINESS.md), [CUSTOMER_DELIVERY.md](CUSTOMER_DELIVERY.md), and [PRICING.md](PRICING.md).

## Sales Demo Path

Use seeded or non-sensitive customer-like data only.

1. Login with the local demo admin in a development or staging environment.
2. Show the user menu in the lower-left corner and explain session-based admin access.
3. Open **Enterprise Settings** and show business spaces, accounts, members and roles, enterprise login, and audit logs.
4. Create a workspace for a department or environment.
5. Create a user and assign a role to the workspace.
6. Add an enterprise login method for Google Workspace, Microsoft Entra ID, Okta, Feishu, WeCom, or DingTalk.
7. Open Audit Logs and show the recorded tenant/admin changes.
8. Open **Models** and explain primary model, fallback models, capability flags, and channel API keys.
9. Open **Agents** and show model selection, fallback models, tools, skills, and knowledge binding.
10. Run **Test Chat** with a safe test prompt and show streaming, token usage, and trace visibility.
11. Close with the private-cloud operation story: preflight, PostgreSQL, backup, restore, upgrade, rollback.

## Sales Readiness

Before sales runs market outreach, confirm:

- Target customer deployment shape: single VM, Docker Compose, Kubernetes, or customer-managed platform.
- Required identity system: OIDC, Google Workspace, Microsoft Entra ID, Okta, Auth0, Keycloak, GitHub Enterprise, Feishu, WeCom, or DingTalk.
- Data residency and network constraints: offline, intranet-only, proxy, or outbound LLM provider allowlist.
- Supported database and backup ownership: included Docker Compose PostgreSQL, customer PostgreSQL, or managed PostgreSQL.
- Support model: upgrade assistance, emergency rollback help, and release cadence.
- Pricing unit: organization, workspace, user seat, agent count, model usage, or support tier.

## Demo Environment Rules

- Do not demo with production secrets, real API keys, raw customer data, or personal accounts.
- Keep demo credentials in `.env` only.
- Reset or snapshot the demo database before customer-facing demos. Prefer `pnpm demo:reset`, `pnpm demo:seed`, and `pnpm demo:status` on a disposable staging database.
- If an external SSO callback is shown, use a staging app registration and staging callback URL.
