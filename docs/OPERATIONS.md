# AgentForge Private-Cloud Operations

This runbook is for customer private-cloud operators and release engineers.

## Production Database

Use PostgreSQL for all private-cloud production deployments. AgentForge no longer supports SQLite or MySQL runtime modes.

Required environment:

```bash
DB_TYPE=postgres
POSTGRES_HOST=postgres.example.internal
POSTGRES_PORT=5432
POSTGRES_USER=agentforge
POSTGRES_PASSWORD=<strong database password>
POSTGRES_DB=agentforge
POSTGRES_POOL_MAX=10
POSTGRES_IDLE_TIMEOUT_MS=30000
POSTGRES_CONNECTION_TIMEOUT_MS=5000
```

`POSTGRES_URL=postgres://user:password@host:5432/database` or `DATABASE_URL=postgres://...` is also supported.

Keep the application pool small and predictable. For higher concurrency, put PgBouncer or the customer's managed pooler in front of PostgreSQL, then tune `POSTGRES_POOL_MAX` against that pooler.

## Preflight

Run before every production rollout:

```bash
NODE_ENV=production pnpm preflight:prod
```

Expected result: no `FAIL` checks. Any non-PostgreSQL `DB_TYPE` is a blocker.

## Migration Verification

Run against a staging copy or a newly provisioned production database before switching traffic:

```bash
pnpm verify:postgres
```

The command initializes schema, applies migrations, creates a temporary workspace, agent, knowledge base, agent-knowledge relation, and audit row, then verifies the audit row can be read back.

## Backup

Create a logical PostgreSQL backup before upgrade:

```bash
BACKUP_DIR=backups pnpm backup:postgres
```

The script uses `pg_dump` and writes `backups/agentforge-<database>-<timestamp>.sql.gz`. Store backups outside the application container and keep at least one known-good backup from before the upgrade window.

## Restore

Restore into an empty or explicitly prepared database:

```bash
pnpm restore:postgres backups/agentforge-prod-20260627-120000.sql.gz
```

After restore:

```bash
pnpm verify:postgres
NODE_ENV=production pnpm preflight:prod
```

## Upgrade

1. Announce a maintenance window.
2. Confirm current commit/tag and record the target version.
3. Run `pnpm backup:postgres`.
4. Restore the backup into a staging database and run `pnpm verify:postgres`.
5. Pull the new release image or code.
6. Run `NODE_ENV=production pnpm preflight:prod`.
7. Start the app and confirm `/health`.
8. Browser-smoke login, Tenants audit logs, Models, Agents, Knowledge, and Test Chat.
9. Keep the previous image and backup available until smoke passes.

## Rollback

1. Stop the new application version.
2. Restore the pre-upgrade PostgreSQL backup if the new version wrote incompatible data.
3. Start the previous application image/commit.
4. Confirm `/health`, login, audit logs, and one agent chat.
5. Record the failed version, logs, and failed verification command before retrying.
