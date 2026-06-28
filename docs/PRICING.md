# AgentForge Pricing And Packaging Guide

This is a sales planning guide, not a binding price sheet.

## Recommended Packaging

AgentForge should be sold as private-cloud enterprise software plus upgrade/support service.

| Package | Best For | Includes |
|---|---|---|
| Team Trial | One department proving value | Single environment, local admin, one IdP, basic support, Docker Compose PostgreSQL |
| Business | Multiple departments in one company | Production PostgreSQL, SSO, audit logs, model fallback, backup/restore runbook, standard upgrade help |
| Enterprise | Security-sensitive or global rollout | Multiple workspaces, strict change control, dedicated upgrade window, SSO rollout support, priority incident response |

## Pricing Units

Prefer a simple base subscription plus service model:

- Annual private-cloud license by organization size.
- Support tier by response time and upgrade assistance.
- Optional implementation package for first deployment and SSO setup.
- Optional additional environments: staging, DR, regional deployment.

Avoid early pricing tied only to token usage. Customers may bring their own model keys, and usage pricing can blur responsibility between AgentForge and the LLM provider.

## Suggested Quote Structure

1. **Software license**: right to deploy AgentForge in customer private cloud.
2. **Support and upgrades**: release guidance, preflight help, rollback help, limited troubleshooting.
3. **Implementation service**: first deployment, IdP setup, backup plan, demo handoff.
4. **Optional add-ons**: extra environments, custom connector, training, security review support.

## What Sales Should Qualify

- Number of departments and users.
- Required identity provider.
- Required LLM provider or private LLM gateway.
- Data residency and network limits.
- Whether customer needs offline or intranet-only operation.
- Expected upgrade cadence.
- Procurement preference: license, subscription, service contract, or bundled project.

## Buyer Narrative

For executives:

- AgentForge lets teams deploy AI agents without sending admin data to a public SaaS control plane.
- IT keeps control over identity, database, network, backups, and upgrades.
- Business teams get reusable agents, model fallback, tools, skills, knowledge bases, and usage visibility.
- The main risk is not initial deployment; it is repeatable operations. The product includes preflight, backup, restore, rollback, audit, and demo reset workflows to reduce that risk.

For IT:

- Private-cloud deployment keeps customer data in customer infrastructure.
- SSO and local emergency admin coexist.
- Audit logs cover sensitive tenant/admin changes.
- PostgreSQL is the only runtime database path.
- Secrets are passed by environment or secret reference, not stored in docs or audit metadata.

## Quote Readiness Gate

Before sending a quote, sales should know:

- Deployment package: Team Trial, Business, or Enterprise.
- Number of environments.
- SSO provider.
- Support SLA expectation.
- Whether implementation service is required.
- Customer owner for database backup and restore.
- Customer owner for LLM API keys or model gateway.
