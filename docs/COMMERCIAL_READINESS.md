# AgentForge Commercial Readiness Target

This target defines what "repeatable delivery, demo-ready, price-ready, and acceptable to customer IT/executives" means.

## Goal

AgentForge is commercially ready when a salesperson, delivery engineer, customer IT owner, and business executive can each complete their decision workflow without custom engineering help.

## Non-Goals

- No hosted public SaaS in this target.
- No payment processing or license server enforcement in this target.
- No customer-specific security certification claims without customer evidence.

## Acceptance Matrix

| Audience | Must Be Able To | Evidence |
|---|---|---|
| Sales | Run a clean demo repeatedly and explain the buying unit | `pnpm demo:reset`, `pnpm demo:seed`, [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), [PRICING.md](PRICING.md) |
| Delivery | Deploy, preflight, seed demo, back up, restore, upgrade, and roll back | [OPERATIONS.md](OPERATIONS.md), [CUSTOMER_DELIVERY.md](CUSTOMER_DELIVERY.md), `pnpm preflight:prod`, `pnpm verify:mysql`, `pnpm backup:mysql`, `pnpm restore:mysql` |
| Customer IT | Review architecture, ports, identity, secrets, database, backup, logs, upgrade, and rollback | [CUSTOMER_DELIVERY.md](CUSTOMER_DELIVERY.md), [MAINTENANCE.md](MAINTENANCE.md) |
| Executive buyer | Understand value, rollout risk, support model, and pricing structure | [PRICING.md](PRICING.md), [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) |
| Maintainer | Know which files and commands must stay current | `AGENTS.md`, [MAINTENANCE.md](MAINTENANCE.md), `task.md` |

## P0 Delivery Checks

1. Commercial readiness target and acceptance matrix are defined.
2. Deterministic demo reset/seed/status scripts exist.
3. Customer IT delivery checklist exists.
4. Sales pricing and packaging guidance exists.
5. Demo scripts pass on a disposable SQLite database.
6. README, release checklist, maintenance guide, and agent guide link to the commercial delivery materials.
7. Commit and push only after verification evidence is captured.

## Demo Environment Standard

Demo data must be recognizable and disposable:

- Workspace slug: `demo-sales`
- Demo user: `demo.viewer@example.com`
- Identity provider names: `Demo Google Workspace`, `Demo Feishu`
- Demo model, agent, tool, and knowledge-base names start with `Demo`

Before a customer-facing demo:

```bash
pnpm demo:reset
pnpm demo:seed
pnpm demo:status
```

Expected result: status shows non-zero demo workspace, user, agent, model, tool, knowledge base, and identity providers. Login page should show the demo SSO providers only when the demo database is seeded.

## Release Version Standard

Every customer delivery should record:

- Git commit SHA or release tag.
- Docker image tag or source package checksum.
- Database type and version.
- Enabled identity provider type.
- Preflight output.
- Backup filename and restore test result.
- Browser smoke result.

Recommended first commercial tag format:

```bash
v0.1.0-private-cloud
```

## Open Commercial Decisions

These are business decisions, not engineering blockers:

- Final list price and discount policy.
- Support SLA tiers.
- Whether licensing is trust-based, contract-based, or enforced by a future license file.
- Whether implementation service is bundled or sold separately.
