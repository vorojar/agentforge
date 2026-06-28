#!/usr/bin/env bash
set -euo pipefail

pnpm build
scripts/with-postgres-test.sh pnpm test
scripts/with-postgres-test.sh pnpm exec vitest run tests/integration/full-flow.test.ts --pool=forks --maxWorkers=1
scripts/with-postgres-test.sh pnpm verify:postgres
pnpm verify:commercial
