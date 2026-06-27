# AgentForge Maintenance Guide

This file is the project-level guide for Codex, Claude, and other coding agents working in this repository. Follow it before making code changes. If this guide conflicts with the user's latest request or higher-priority system/developer instructions, follow the stricter instruction.

## Project Shape

AgentForge is a TypeScript monorepo:

- `packages/types`: shared interfaces and contracts. Keep this free of runtime dependencies.
- `packages/database`: database adapters, migrations, and persistence tests. SQLite and MySQL behavior must stay aligned.
- `packages/providers`: LLM provider adapters. Avoid importing heavyweight SDKs at module load when it creates test/runtime warnings.
- `packages/tools`: builtin tools, HTTP tools, embeddings, and tool execution.
- `packages/skills`: Skill parsing, loading, registry, and hot reload.
- `packages/core`: agent loop, context building, model failover trace, compression, tool orchestration.
- `packages/server`: Fastify API, bootstrap wiring, auth, routes, provider registry.
- `packages/web`: Vue 3 + Element Plus admin UI.
- `docker`: Dockerfile and compose setup.

## Required Verification

Prefer the unified project entry:

```bash
./scripts/verify.sh
```

At minimum, run these before handing off a code change:

```bash
pnpm build
pnpm test
```

Expected clean state:

- `pnpm build` succeeds without Vite chunk size warnings.
- `pnpm test` succeeds without Node `punycode` deprecation warnings.
- UI changes are checked in a real browser at `http://localhost:5173`, including console errors/warnings.
- If you touch shared runtime behavior, make sure both build and tests pass from the repo root, not only a package-local command.

## Frontend And i18n

All user-visible web UI text must go through `packages/web/src/i18n.ts`.

- Supported locales are `zh`, `ja`, and `en`.
- Add all three translations for every new key in the same change.
- Do not add hardcoded visible text in Vue templates, Element Plus labels, placeholders, empty states, popconfirm titles, dialog titles, toasts, or validation messages.
- Product names, API names, code identifiers, route names, model names, provider names, file paths, and user-created data should not be translated.
- Element Plus component locale is wired in `packages/web/src/App.vue`; do not bypass it.
- The language selector lives in `packages/web/src/components/Layout.vue`.
- If chart labels depend on locale, re-render charts on locale changes and check the browser console.
- Dashboard table headers must not wrap awkwardly; keep the Requests column single-line.

Useful checks:

```bash
rg -n '>[^<{}]*[A-Za-z][^<{}]*<' packages/web/src --glob '*.vue'
rg -n '(label|title|placeholder|empty-text|description)="[^"]*[A-Za-z][^"]*"' packages/web/src --glob '*.vue'
rg -n 'ElMessage\.(success|error|warning|info)\("[^"]|ElMessageBox\.(confirm|prompt)\("[^"]' packages/web/src --glob '*.vue'
```

Review matches manually. Some English text is intentional, such as `AgentForge`, `HTTP`, `cURL`, `Python`, API field names, and code examples.

## Provider And Failover Rules

- Agent model selection uses provider configs from the Models page.
- Respect provider capabilities: tools, vision, thinking, and streaming must not be assumed.
- If a model does not support a capability, disable or skip that behavior explicitly and make the UI explain it.
- Keep failover trace observable. When fallback behavior changes, update persisted message trace and Session Detail rendering together.
- Do not silently fallback from invalid provider configuration to mock/dev behavior in production.

## Database Rules

- Schema changes must update migrations and adapters together.
- SQLite and MySQL must both be considered for new fields.
- Private-cloud production uses the database factory and should prefer `DB_TYPE=mysql`; keep `pnpm verify:mysql`, backup/restore scripts, and `docs/OPERATIONS.md` aligned with schema or deployment changes.
- Add or update database tests for persistence changes.
- Enterprise/private-cloud work must build on the tenant foundation: organizations, workspaces, users, memberships, identity provider configs, and audit logs.
- Core runtime data must stay workspace-scoped: agents, providers/channels, HTTP tools, skill categories, knowledge bases, sessions, usage, and proxy usage.
- Identity provider credentials should be stored as secret references, not raw secret values in tenant config rows.
- Do not hide missing required business data with `?? 0`, `"Unknown"`, or similar fallback values unless the field is genuinely optional.
- Keep generated/local data out of git: `.env`, local DB files, logs, and `.agent/` artifacts are not deliverables.

## API And Runtime Rules

- Admin routes should authenticate with local/IdP login sessions; `X-Admin-Secret` is only a compatibility and emergency-maintenance fallback. Public chat routes use API key auth.
- Do not log API keys, admin secrets, bearer tokens, or raw provider credentials.
- Local passwords and session tokens must never be stored raw. Store password hashes and session token hashes only.
- Validate tenant membership roles and IdP types at the API boundary before writing them.
- Admin API detail/update/delete routes must verify the resource belongs to the resolved workspace (`X-Workspace-Id`, `workspaceId` query/body, then default workspace).
- Sensitive tenant/admin changes should create audit logs.
- Preserve API compatibility unless the user explicitly asks for a breaking change.
- Add route tests when changing auth, routing, validation, provider registry behavior, or session/message persistence.
- SSE and non-streaming chat should stay behaviorally aligned where possible.

## UI Review Checklist

For UI changes, verify:

- Desktop layout at the normal development viewport.
- No incoherent overlap, clipping, or awkward wrapping in tables/buttons.
- Loading, empty, error, and success states.
- Console has no new `error` or `warning` entries from the changed interaction.
- Language switching still works for Chinese, Japanese, and English.

## Documentation Rules

- `README.md` is for users and new contributors: capabilities, setup, configuration, API overview, and high-level maintenance commands.
- `AGENTS.md` is for coding agents: repo rules, validation, architecture boundaries, and non-negotiable checks.
- `docs/MAINTENANCE.md` is the detailed checklist for recurring maintenance.
- `docs/OPERATIONS.md` is the production operator runbook for MySQL, backup, restore, upgrade, and rollback.
- Keep docs short enough to stay useful. If behavior changes, update the closest durable doc in the same change.

## Commit Hygiene

- Do not commit unless the user asks.
- Before any commit, inspect `git diff` and `git status`.
- Keep unrelated changes separate.
- Never revert user changes unless the user explicitly asks.
