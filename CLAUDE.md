# AgentForge — Project Guide

For current project maintenance rules, read `AGENTS.md` first. This file keeps historical Claude-oriented notes, but `AGENTS.md` and `docs/MAINTENANCE.md` are the durable source for verification, i18n, failover, database, and UI maintenance discipline.

## What is this

Enterprise AI Agent service platform. Docker-deployable, Vue3 admin UI, business teams create agents and call them via API keys. Monorepo with 8 packages under `packages/`.

## Architecture

```
packages/types      → TypeScript interfaces (zero runtime deps)
packages/database   → PostgreSQL adapter + migrations
packages/providers  → LLM adapters (Claude, OpenAI-compatible) + failover
packages/tools      → Tool registry, executor, builtins, HTTP tools, embedding, chunker
packages/skills     → Skill parser, matcher (CJK bigram), loader (lazy + hot reload)
packages/core       → Agent loop, context builder (compression), token utils
packages/server     → Fastify API, routes, SSE streaming, bootstrap
packages/web        → Vue3 + Element Plus admin UI
```

## Key Design Decisions

### Multi-Provider with Failover
- Each agent selects a provider + model. ProviderRegistry wraps with failover proxy.
- Failed provider gets 60s cooldown, auto-recover. All providers down → clear error.

### Knowledge Base (RAG)
- Hybrid search: vector cosine similarity (60%) + BM25 keyword (40%).
- Volcano Engine Embedding API for vectorization. Falls back to pure BM25 without config.
- `search_knowledge` tool auto-injected for all agents (not in whitelist UI).

### Skill System
- Startup loads only name + description (lightweight).
- On match: injects SKILL.md body + system instruction to read supporting files.
- `read_skill_file` tool lets LLM read template.md, examples/, references/ on demand.
- Both tools auto-injected via `AUTO_INJECT_TOOLS` in agent-loop.ts.
- Matcher uses CJK bigram tokenization — Chinese queries match bilingual descriptions.

### Context Compression
- Old tool_result blocks truncated to 200 chars (keep last 3 intact).
- History exceeding 80k token budget gets oldest messages dropped (min keep 10 turns).

## Lessons Learned (Engineering)

### System control, not model initiative
Deterministic behavior must be controlled by the system layer, never by hoping the model is "smart enough" to figure it out. Example: `read_skill_file` instruction placed BEFORE skill content as STEP 1, not as a suggestion at the end.

### CJK text matching requires proper tokenization
Never use `.split(/\s+/)` for Chinese text. Chinese has no spaces. Use CJK bigram sliding window for matching, keyword extraction, and search. This applies to skill matcher, knowledge search, and any text comparison involving Chinese.

### Description must cover user vocabulary
A skill's `description` determines matching quality. Must include terms users actually say, in all languages they use. English-only description fails for Chinese users. Format: `English explanation + 中文关键词列表`.

### Supporting files: layered loading, never bulk injection
- SKILL.md body → system injects (always)
- template/examples/references → LLM reads via tool (on demand)
- Large reference data → RAG via search_knowledge
This prevents prompt bloat while maintaining precision.

### Deliver = user can use it
Every change must be self-verified: build, restart, test, confirm working. Never say "you try it" or "restart and check". Agent uploads knowledge → verify search works → verify chat returns correct answer.

### Don't kill all Node.js processes
`taskkill /IM node.exe` kills Claude Code itself. Always kill by specific PID found via `netstat -ano | grep :PORT`.

## Workflow Rules

### Audit findings: fix all or get explicit approval to skip
When a code review or audit produces findings, every item must be either fixed or explicitly approved by the user to skip. Do not silently skip findings by saying "投入产出比低" — list skipped items and get confirmation. Partially fixing an audit (e.g. fixing stats N+1 but not agents N+1) is worse than not auditing at all because it creates false confidence.

### CHANGELOG.md maintenance
Every feature commit, bug fix, or breaking change MUST update CHANGELOG.md in the same commit. Categorize under Added/Changed/Fixed/Removed/Security. Group related changes under a version heading. Do not batch — update as you go.

## Commands

```bash
pnpm install          # Install deps
pnpm build            # Build all packages
pnpm test             # Run the test suite
./scripts/verify.sh   # Preferred full verification entry
pnpm dev              # Start dev (API :3000 + Web :5173)
```

## Environment

- LLM: primarily Doubao (Volcano Engine OpenAI-compatible API)
- Embedding: Volcano Engine doubao-embedding-vision API
- Database: PostgreSQL (`pg`)
- Skills directory: `skills/` at project root
