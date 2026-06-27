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
BACKUP_FILE="${1:-${BACKUP_FILE:-}}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: scripts/restore-mysql.sh path/to/backup.sql[.gz]" >&2
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [[ "$BACKUP_FILE" == *.gz ]]; then
  gzip -dc "$BACKUP_FILE" | MYSQL_PWD="$db_password" mysql \
    --host="$MYSQL_HOST" \
    --port="$MYSQL_PORT" \
    --user="$MYSQL_USER" \
    "$MYSQL_DATABASE"
else
  MYSQL_PWD="$db_password" mysql \
    --host="$MYSQL_HOST" \
    --port="$MYSQL_PORT" \
    --user="$MYSQL_USER" \
    "$MYSQL_DATABASE" < "$BACKUP_FILE"
fi

echo "MySQL restore completed from $BACKUP_FILE"
