#!/usr/bin/env bash
set -euo pipefail

container_name="${POSTGRES_TEST_CONTAINER:-agentforge-postgres-test}"
port="${POSTGRES_TEST_PORT:-55432}"
test_password_var="POSTGRES_TEST_PASSWORD"
password="${!test_password_var:-agentforge-test-password}"
postgres_password_var="POSTGRES_PASSWORD"
database="${POSTGRES_TEST_DB:-agentforge_test}"
user="${POSTGRES_TEST_USER:-agentforge}"

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if ! docker ps --format '{{.Names}}' | grep -qx "$container_name"; then
    if docker ps -a --format '{{.Names}}' | grep -qx "$container_name"; then
      docker rm -f "$container_name" >/dev/null
    fi
    docker run -d --rm \
      --name "$container_name" \
      -e POSTGRES_DB="$database" \
      -e POSTGRES_USER="$user" \
      -e "${postgres_password_var}=${password}" \
      -p "127.0.0.1:${port}:5432" \
      postgres:17-alpine >/dev/null
  fi

  for _ in $(seq 1 60); do
    if docker exec "$container_name" pg_isready -U "$user" -d "$database" >/dev/null 2>&1; then
      export POSTGRES_TEST_URL="postgres://${user}:${password}@127.0.0.1:${port}/${database}"
      export POSTGRES_URL="$POSTGRES_TEST_URL"
      "$@"
      exit $?
    fi
    sleep 1
  done

  echo "PostgreSQL test container did not become ready in time." >&2
  exit 1
fi

for command_name in initdb pg_ctl pg_isready createdb; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Docker is unavailable and ${command_name} is not installed; cannot start PostgreSQL for tests." >&2
    exit 1
  fi
done

data_dir="${POSTGRES_TEST_DATA_DIR:-$(mktemp -d /tmp/agentforge-postgres-test.XXXXXX)}"
log_file="${data_dir}/postgres.log"
started_local=0

cleanup() {
  if [[ "$started_local" == "1" ]]; then
    pg_ctl -D "$data_dir" -m fast stop >/dev/null 2>&1 || true
  fi
  if [[ -z "${POSTGRES_TEST_DATA_DIR:-}" ]]; then
    rm -rf "$data_dir"
  fi
}
trap cleanup EXIT

if [[ ! -f "${data_dir}/PG_VERSION" ]]; then
  initdb -D "$data_dir" --username="$user" --auth=trust >/dev/null
fi

pg_ctl -D "$data_dir" -o "-p ${port} -k /tmp" -l "$log_file" start >/dev/null
started_local=1

for _ in $(seq 1 60); do
  if pg_isready -h 127.0.0.1 -p "$port" -U "$user" >/dev/null 2>&1; then
    createdb -h 127.0.0.1 -p "$port" -U "$user" "$database" >/dev/null 2>&1 || true
    export POSTGRES_TEST_URL="postgres://${user}@127.0.0.1:${port}/${database}"
    export POSTGRES_URL="$POSTGRES_TEST_URL"
    "$@"
    exit $?
  fi
  sleep 1
done

echo "Local PostgreSQL test server did not become ready in time." >&2
exit 1
