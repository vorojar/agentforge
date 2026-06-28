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
BACKUP_DIR="${BACKUP_DIR:-backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_FILE="${BACKUP_FILE:-${BACKUP_DIR}/agentforge-${POSTGRES_DB}-${TIMESTAMP}.sql.gz}"

mkdir -p "$(dirname "$OUTPUT_FILE")"

env "${pg_password_var}=${db_password}" pg_dump \
  --host="$POSTGRES_HOST" \
  --port="$POSTGRES_PORT" \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --format=plain \
  --no-owner \
  --no-privileges | gzip -c > "$OUTPUT_FILE"

echo "PostgreSQL backup written to $OUTPUT_FILE"
