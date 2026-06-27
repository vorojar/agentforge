#!/usr/bin/env bash
set -euo pipefail

: "${MYSQL_HOST:?MYSQL_HOST is required}"
: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE is required}"

password_var="MYSQL_PASSWORD"
db_password="${!password_var:-}"
if [[ -z "$db_password" ]]; then
  echo "${password_var} is required" >&2
  exit 1
fi

MYSQL_PORT="${MYSQL_PORT:-3306}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_FILE="${BACKUP_FILE:-${BACKUP_DIR}/agentforge-${MYSQL_DATABASE}-${TIMESTAMP}.sql.gz}"

mkdir -p "$(dirname "$OUTPUT_FILE")"

MYSQL_PWD="$db_password" mysqldump \
  --host="$MYSQL_HOST" \
  --port="$MYSQL_PORT" \
  --user="$MYSQL_USER" \
  --single-transaction \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  "$MYSQL_DATABASE" | gzip -c > "$OUTPUT_FILE"

echo "MySQL backup written to $OUTPUT_FILE"
