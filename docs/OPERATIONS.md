# AgentForge Private-Cloud Operations

This runbook is for customer private-cloud operators and release engineers.

## Production Database

Use MySQL for multi-user private-cloud production deployments.

Required environment:

```bash
DB_TYPE=mysql
MYSQL_HOST=mysql.example.internal
MYSQL_PORT=3306
MYSQL_USER=agentforge
MYSQL_PASSWORD=<strong database password>
MYSQL_DATABASE=agentforge
```

`MYSQL_URL=mysql://user:password@host:3306/database` is also supported. SQLite remains available for local development and small single-node trials.

## Preflight

Run before every production rollout:

```bash
NODE_ENV=production pnpm preflight:prod
```

Expected result: no `FAIL` checks. Warnings require an explicit operator decision; for production customers, `DB_TYPE=sqlite` should normally be treated as a blocker.

## Migration Verification

Run against a staging copy or a newly provisioned production database before switching traffic:

```bash
DB_TYPE=mysql pnpm verify:mysql
```

The command initializes schema, applies migrations, creates a temporary workspace, agent, knowledge base, agent-knowledge relation, and audit row, then verifies the audit row can be read back.

## Backup

Create a logical MySQL backup before upgrade:

```bash
BACKUP_DIR=backups pnpm backup:mysql
```

The script uses `mysqldump --single-transaction` and writes `backups/agentforge-<database>-<timestamp>.sql.gz`. Store backups outside the application container and keep at least one known-good backup from before the upgrade window.

## Restore

Restore into an empty or explicitly prepared database:

```bash
pnpm restore:mysql backups/agentforge-prod-20260627-120000.sql.gz
```

After restore:

```bash
DB_TYPE=mysql pnpm verify:mysql
NODE_ENV=production pnpm preflight:prod
```

## Upgrade

1. Announce a maintenance window.
2. Confirm current commit/tag and record the target version.
3. Run `pnpm backup:mysql`.
4. Restore the backup into a staging database and run `pnpm verify:mysql`.
5. Pull the new release image or code.
6. Run `NODE_ENV=production pnpm preflight:prod`.
7. Start the app and confirm `/health`.
8. Browser-smoke login, Tenants audit logs, Models, Agents, Knowledge, and Test Chat.
9. Keep the previous image and backup available until smoke passes.

## Rollback

1. Stop the new application version.
2. Restore the pre-upgrade MySQL backup if the new version wrote incompatible data.
3. Start the previous application image/commit.
4. Confirm `/health`, login, audit logs, and one agent chat.
5. Record the failed version, logs, and failed verification command before retrying.
