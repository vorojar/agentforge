# AgentForge Customer Delivery Checklist

Use this checklist with customer IT before a private-cloud rollout.

## Deployment Shape

Supported first-wave deployment:

- Docker Compose on a customer-controlled VM or private cloud host.
- PostgreSQL for all deployments. Docker Compose can start an included PostgreSQL service, or customers can provide an existing PostgreSQL instance.
- HTTPS termination by customer load balancer, reverse proxy, or ingress.
- Outbound network access from AgentForge to selected LLM providers and enterprise IdP endpoints.

Future deployment shapes can include Kubernetes or customer platform packaging, but they must still pass the same preflight and smoke checks.

## Required Customer Inputs

| Area | Required Input |
|---|---|
| Domain | External URL, for example `https://agentforge.example.com` |
| Database | PostgreSQL host, port, database, user, password, backup owner |
| Identity | OIDC/OAuth provider, client ID, secret reference, callback URL registration |
| LLM | Approved provider, base URL if private gateway is used, API key ownership |
| Security | Admin owner email, emergency admin secret owner, password rotation policy |
| Network | Outbound allowlist, proxy, DNS, TLS certificate owner |
| Operations | Upgrade window, rollback owner, log retention, backup retention |

## Ports And URLs

| Component | Default |
|---|---|
| Web/API | `3000` in Docker production |
| Local web dev | `5173` |
| Health | `/health` |
| OIDC callback | `/api/auth/oidc/:providerId/callback` |
| Enterprise OAuth callback | `/api/auth/oauth/:providerId/callback` |

## Secrets

Secrets must be supplied through `.env`, container secrets, or the customer secret manager:

- `LLM_API_KEY`
- `ADMIN_SECRET`
- `ADMIN_PASSWORD`
- `POSTGRES_PASSWORD`
- IdP client secret environment variables referenced by `clientSecretRef`

Do not put raw secrets in README files, tickets, chat, screenshots, audit logs, or demo scripts.

## Production Preflight

Run before switching traffic:

```bash
NODE_ENV=production pnpm preflight:prod
```

Expected result: all checks are `[OK]`. Any non-PostgreSQL database configuration is a blocker.

## Database Verification

Production-like PostgreSQL must pass:

```bash
pnpm verify:postgres
```

The command checks schema initialization, tenant creation, agent creation, knowledge-base creation, relation persistence, audit write/read, and adapter shutdown.

## Backup And Restore

Before upgrade:

```bash
pnpm backup:postgres
```

Restore test on non-production:

```bash
pnpm restore:postgres backups/<backup-file>.sql.gz
pnpm verify:postgres
```

## Demo Reset

For staging demos only:

```bash
pnpm demo:reset
pnpm demo:seed
pnpm demo:status
```

Do not run demo seed against production customer data unless the customer explicitly wants a demo workspace.

## Go-Live Smoke

After deployment or upgrade:

1. Open `/health`.
2. Login with local admin or configured SSO.
3. Confirm lower-left user menu shows the signed-in user.
4. Open **Tenants** and check Organization, Workspace, Users, Members, Identity Providers, and Audit Logs.
5. Open **Models** and confirm at least one enabled model.
6. Open **Agents** and confirm model/fallback configuration.
7. Run a safe **Test Chat** prompt.
8. Check browser console for new errors or warnings.
9. Check application logs for auth, model, database, or provider errors.

## Rollback Evidence

Before customer sign-off, record:

- Current release tag or commit SHA.
- Previous release tag or commit SHA.
- Backup filename.
- Restore test result.
- Smoke test result.
- Known limitations accepted by customer.
