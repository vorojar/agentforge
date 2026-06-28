# AgentForge Maintenance Checklist

This document records the recurring checks that should survive beyond a single coding session.

## Standard Local Verification

Run from the repository root:

```bash
./scripts/verify.sh
```

The script runs:

```bash
pnpm build
pnpm test
pnpm verify:commercial
```

The expected result is a clean pass with no Vite chunk size warning and no Node `punycode` deprecation warning.

## i18n Checklist

When changing the web UI:

1. Add or reuse keys in `packages/web/src/i18n.ts`.
2. Provide Chinese, Japanese, and English text in the same change.
3. Use `t(...)` for Vue template text, labels, placeholders, empty states, dialogs, popconfirm titles, Element Plus messages, and validation prompts.
4. Use computed data for translated arrays/tables so language switching updates without reload.
5. Keep technical identifiers untranslated: API field names, model names, provider names, route paths, `HTTP`, `JSON`, `SSE`, `cURL`, `Python`, `JavaScript`.
6. Browser-check language switching on Dashboard and at least one form-heavy page.
7. Check console errors/warnings after switching `zh -> ja -> en`.

Useful scan commands:

```bash
rg -n '>[^<{}]*[A-Za-z][^<{}]*<' packages/web/src --glob '*.vue'
rg -n '(label|title|placeholder|empty-text|description)="[^"]*[A-Za-z][^"]*"' packages/web/src --glob '*.vue'
rg -n 'ElMessage\.(success|error|warning|info)\("[^"]|ElMessageBox\.(confirm|prompt)\("[^"]' packages/web/src --glob '*.vue'
```

## Model Capability Checklist

When changing providers, agents, or chat execution:

1. Check `ModelCapabilities` in `packages/types`.
2. Keep Provider UI, Agent UI, ProviderRegistry, and AgentLoop behavior aligned.
3. If a provider lacks tools/vision/thinking/streaming, skip or disable the incompatible path explicitly.
4. Keep fallback attempts persisted in `modelTrace`.
5. Verify Session Detail still shows fallback trace clearly.
6. Add tests for fallback selection, skipped candidates, and trace persistence when behavior changes.

## Database Checklist

When adding persisted fields:

1. Update shared types.
2. Update PostgreSQL adapter and migrations.
3. Update PostgreSQL persistence tests.
4. Update API route serialization/deserialization.
5. Update relevant frontend API types.
6. Add or update database tests.
7. Verify existing rows receive sane migration defaults without hiding invalid business data.

## Private-Cloud Operations Checklist

1. All deployments should use `DB_TYPE=postgres` or a PostgreSQL URL.
2. Run `NODE_ENV=production pnpm preflight:prod` before rollout.
3. Run `pnpm verify:postgres` against staging or the target database before switching traffic.
4. Run `pnpm backup:postgres` before upgrade and store the `.sql.gz` outside the app container.
5. Test restore with `pnpm restore:postgres <backup.sql.gz>` on a non-production database before relying on a backup policy.
6. Keep [docs/OPERATIONS.md](OPERATIONS.md) updated whenever deployment, migration, backup, restore, or rollback behavior changes.
7. Keep [docs/RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) updated whenever the launch gate, browser smoke path, or sales demo path changes.
8. Keep [docs/CUSTOMER_DELIVERY.md](CUSTOMER_DELIVERY.md) updated whenever customer IT inputs, ports, URLs, secrets, or go-live smoke change.

## Commercial Readiness Checklist

When changing anything that affects sales, delivery, customer IT, or executive acceptance:

1. Update [docs/COMMERCIAL_READINESS.md](COMMERCIAL_READINESS.md).
2. Update [docs/PRICING.md](PRICING.md) if packaging, support tiers, buyer narrative, or pricing units change.
3. Run `pnpm demo:reset`, `pnpm demo:seed`, and `pnpm demo:status` on a disposable demo database.
4. Confirm demo data uses recognizable `Demo` names and can be reset without touching non-demo data.
5. Do not seed demo data into a production customer database unless explicitly approved by the customer.

## Enterprise Tenant Checklist

When adding SaaS/private-cloud capabilities:

1. Route all enterprise identity integrations through the tenant foundation: Organization, Workspace, User, Membership, Identity Provider, Audit Log.
2. Keep local admin/emergency access available until external IdP login is proven.
3. Store identity provider secrets as references such as `env:NAME` or KMS paths, not raw secret values in normal API payloads, docs, logs, or audit metadata.
4. Validate roles and membership status at the API boundary.
5. Write audit logs for sensitive organization, workspace, membership, provider, model, key, and auth configuration changes.
6. Keep PostgreSQL behavior covered by migrations, adapter tests, and Docker smoke checks.
7. Do not add a provider-specific login path that bypasses workspace scoping or audit logging.
8. Admin APIs should resolve workspace from `X-Workspace-Id`, `workspaceId` query, or body `workspaceId`; if omitted, use the default workspace.
9. Detail/update/delete routes must verify the resource belongs to the resolved workspace before returning data or mutating state.

## Auth Checklist

When changing admin authentication:

1. Keep browser admin access on login sessions, not user-entered Admin Secret.
2. Keep `X-Admin-Secret` only as a documented compatibility/emergency path.
3. Store local passwords with salted hashes only; store session token hashes only.
4. Verify `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, and at least one protected admin route.
5. Browser-test logout: protected routes should redirect to `/login` after logout.
6. Make user identity visible in the UI and keep it out of logs.

## Warning Regression Checklist

These warnings were intentionally cleaned up and should stay gone:

- Vite chunk size warnings during `pnpm build`.
- Node `punycode` deprecation warnings during `pnpm test`.
- Dashboard ECharts `coordinateSystem` errors when switching language.

If any warning returns, treat it as a regression unless there is a documented reason.

## Browser QA Checklist

For frontend work:

1. Start or reuse the dev server at `http://localhost:5173`.
2. Check Dashboard in the browser.
3. Switch `zh`, `ja`, and `en`.
4. Open one form-heavy page, such as `Agents -> Create Agent` or `Models`.
5. Inspect browser console for new warnings/errors.
6. Confirm table headers and buttons do not wrap or overlap.

## Documentation Checklist

When behavior changes:

- User-facing setup/capability changes go in `README.md`.
- Agent workflow and non-negotiable engineering rules go in `AGENTS.md`.
- Detailed repeatable checks go in this file.
- Do not duplicate long API docs across multiple files; link or summarize instead.
