# Changelog

All notable changes to AgentForge are documented in this file.

## [0.5.0] - 2026-03-28

### Added
- **Image support in chat** — Send images (base64 or URL) via Test Chat and API, with multimodal model support
- **AI thinking process display** — Collapsible thinking blocks in Test Chat for reasoning-enabled models (Claude, DeepSeek R1)
- **HTTP Tool server-side proxy** — Tool testing runs through backend to avoid browser CORS restrictions
- **Session Detail image rendering** — User-sent images displayed inline in conversation replay
- **Sessions list smart preview** — Image messages show `📷 text` instead of raw JSON

### Fixed
- Body limit increased to 20MB for image uploads
- All UI text translated to English
- Auto-create database directory if not exists
- Dockerfile uses China mirror for faster builds

## [0.4.0] - 2026-03-26 ~ 2026-03-27

### Added
- **Knowledge Base (RAG)** — Upload documents, auto-chunking (500 char, paragraph-aware), vector embedding (Volcano Engine API), hybrid search (vector 60% + BM25 40%)
- **Skill Editor** — Full CRUD with file tree, inline editor, create/delete skills, hot editing without restart
- **Skill system overhaul** — Lazy loading (name+description at startup, full content on match), supporting files (template.md, examples/, references/), hot reload
- **Context compression** — Auto-truncate old tool results, drop oldest messages when exceeding 80k token budget
- **Provider failover** — Auto-switch to backup provider on failure, 60s cooldown recovery
- **Token usage display** — Test Chat shows `tokens (in↑ out↓) · duration`, Sessions list shows token breakdown with cache hit %
- **Sessions list improvements** — First message preview instead of session ID, pagination (20 per page)

### Changed
- Dashboard: 4 key metrics (Total Sessions, Sessions Today, Total Requests, Total Tokens), Usage by Model + Usage by Agent tables side by side, 7/30/90 day chart range selector
- Skill registry supports `clear()` for proper reload after delete
- `search_knowledge` tool auto-injected for all agents, hidden from Tool Whitelist UI
- Knowledge search supports CJK character decomposition for Chinese text matching
- Provider must be selected before model in Agent editor
- Removed duplicate h2 page titles (already in header)
- Code simplification: SSE helper extracted, formatTime deduplicated, N+1 queries eliminated

### Fixed
- Streaming text chunks merged before persisting (was causing per-character line breaks)
- Skill Editor: full-height textarea, clickable folders for new file, directory picker, empty folder display
- Medical-edu-consultant skill with template, examples, and references

## [0.3.0] - 2026-03-25 (afternoon)

### Added
- **Multi-provider support** — Configure multiple LLM providers (Doubao, DeepSeek, Claude, OpenAI), each agent selects its own provider + model
- **Provider management page** — Card layout, CRUD, enable/disable, set primary
- **Enhanced Dashboard** — Total stats, daily usage chart with time range, usage by model table, usage by agent table
- **Test Chat streaming** — SSE real-time text display when agent has streaming enabled
- **API key naming** — Prompt for key name when generating new API key

### Changed
- Agent editor: provider selector with auto-fill default model, model dropdown updated with grouped options
- Test Chat uses admin route (no API key creation needed)

### Security
- CORS configurable via `CORS_ORIGIN` env var
- `ADMIN_SECRET` required in production (throws error if unset)
- Database indexes on api_keys, sessions, messages, usage_logs
- Chat routes wrapped in try-catch with 502 on LLM failure
- Health check endpoint (`GET /health`) + Docker healthcheck
- Log redaction for authorization and admin-secret headers
- LLM provider timeout (60s) + Fastify request timeout (120s)

## [0.2.0] - 2026-03-25 (morning)

### Added
- **HTTP API Tools** — Configure external REST APIs as agent tools via admin UI, hot-reload without restart
- **Tool hot-reload** — `ToolRegistry.unregister()` for runtime tool management
- **Skills from filesystem** — Skills loaded from `skills/` directory (SKILL.md convention), replacing database storage
- **Skill import** — ZIP upload support

### Changed
- Builtin weather tool replaced with HTTP API Tool (wttr.in)
- Tool Registry UI separates builtin and HTTP tools
- Session page: message count column, local timezone formatting

### Fixed
- dotenv loading from project root (tsx watch cwd compatibility)
- SQLite WAL/SHM files removed from git tracking

## [0.1.0] - 2026-03-24

### Added
- **Project scaffold** — TypeScript monorepo (pnpm + Turborepo), 8 packages
- **Core types** — AgentConfig, Tool, Skill, LLMProvider, Message, Session, DatabaseAdapter interfaces
- **Database layer** — SQLite adapter with migrations, full CRUD for agents, sessions, messages, API keys, usage logs
- **LLM providers** — Claude (Anthropic SDK) and OpenAI-compatible provider adapters
- **Tool system** — Registry, executor with hooks/policy, builtin tools (calculate, time)
- **Skill system** — Markdown parser, keyword matcher, skill registry
- **Agent Loop** — Think-act-observe loop with tool calling, streaming, context management, token tracking
- **API server** — Fastify with agent CRUD, chat (streaming + non-streaming), sessions, tools, skills, stats endpoints
- **Admin authentication** — API key auth for chat, X-Admin-Secret for management
- **Vue3 admin UI** — Dashboard, Agent management, Tool registry, Skill management, Session browser with conversation replay
- **Docker** — Multi-stage Dockerfile + docker-compose with SQLite volume
- **107 unit tests** across all packages
