#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

password_var="POSTGRES_PASSWORD"
db_password="${!password_var:-}"
pg_password_var="PGPASSWORD"
if [[ -z "$db_password" ]]; then
  echo "${password_var} is required" >&2
  exit 1
fi

POSTGRES_PORT="${POSTGRES_PORT:-5432}"
BACKUP_FILE="${1:-${BACKUP_FILE:-}}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: scripts/restore-postgres.sh path/to/backup.sql[.gz]" >&2
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [[ "$BACKUP_FILE" == *.gz ]]; then
  gzip -dc "$BACKUP_FILE" | env "${pg_password_var}=${db_password}" psql \
    --host="$POSTGRES_HOST" \
    --port="$POSTGRES_PORT" \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB"
else
  env "${pg_password_var}=${db_password}" psql \
    --host="$POSTGRES_HOST" \
    --port="$POSTGRES_PORT" \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" < "$BACKUP_FILE"
fi

echo "PostgreSQL restore completed from $BACKUP_FILE"
