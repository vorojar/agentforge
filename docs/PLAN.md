# AgentForge Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a unified Agent service platform (AgentForge) — a Docker-deployable service with Vue3 admin UI, where each business team can create, configure, and call AI Agents via API.

**Architecture:** Monorepo with `packages/` structure. Backend is Fastify serving both REST API and static Vue3 frontend. Core framework (agent-loop, tools, skills, providers, db) is modular with clean interfaces. SQLite by default, swappable to PostgreSQL/MySQL via DatabaseAdapter abstraction.

**Tech Stack:** TypeScript, Node.js 18+, Fastify, Vue 3 + Vite + Element Plus, SQLite (better-sqlite3) / PostgreSQL (pg) / MySQL (mysql2), Docker, pnpm monorepo with Turborepo.

---

## Project Structure

```
agentforge/
├── package.json                    # Root monorepo config (pnpm workspaces + turborepo)
├── pnpm-workspace.yaml
├── turbo.json
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── packages/
│   ├── types/                      # Shared TypeScript interfaces
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── agent.ts            # AgentConfig, AgentState
│   │       ├── tool.ts             # Tool, ToolResult, ToolRegistry
│   │       ├── skill.ts            # Skill, SkillRegistry
│   │       ├── llm.ts              # LLMProvider, LLMRequest, LLMResponse, LLMStreamChunk
│   │       ├── message.ts          # Message, ContentBlock, Session
│   │       └── database.ts         # DatabaseAdapter interface
│   │
│   ├── database/                   # Database adapter layer
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── adapter.ts          # Abstract DatabaseAdapter
│   │       ├── sqlite.ts           # SQLite implementation
│   │       ├── postgresql.ts       # PostgreSQL implementation (stub)
│   │       ├── mysql.ts            # MySQL implementation (stub)
│   │       └── migrations.ts       # Schema creation
│   │
│   ├── providers/                  # LLM provider adapters
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── claude.ts           # Claude (Anthropic) provider
│   │       ├── openai.ts           # OpenAI-compatible provider
│   │       └── factory.ts          # createProvider(config)
│   │
│   ├── tools/                      # Tool system
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── registry.ts         # ToolRegistry implementation
│   │       ├── executor.ts         # Tool execution with hooks & policy
│   │       └── builtin/
│   │           ├── index.ts
│   │           ├── weather.ts      # Demo: weather tool
│   │           ├── calculate.ts    # Demo: calculator tool
│   │           └── time.ts         # Demo: timezone tool
│   │
│   ├── skills/                     # Skill system (Claude Code style)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── registry.ts         # SkillRegistry implementation
│   │       ├── parser.ts           # Parse .md frontmatter + body
│   │       └── matcher.ts          # Match user input to skills
│   │
│   ├── core/                       # Agent Loop + Context Manager
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── agent-loop.ts       # The agentic loop
│   │       ├── context.ts          # Context builder (system prompt + history + skills)
│   │       └── token-utils.ts      # Token estimation utilities
│   │
│   ├── server/                     # Fastify API server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Server entry point
│   │       ├── app.ts              # Fastify app factory
│   │       ├── config.ts           # Environment config
│   │       ├── auth.ts             # API key authentication
│   │       ├── routes/
│   │       │   ├── agents.ts       # CRUD /api/agents
│   │       │   ├── chat.ts         # POST /api/chat, /api/chat/stream
│   │       │   ├── sessions.ts     # GET /api/sessions, /api/sessions/:id/messages
│   │       │   ├── tools.ts        # GET /api/tools
│   │       │   ├── skills.ts       # CRUD /api/skills
│   │       │   └── stats.ts        # GET /api/stats
│   │       └── bootstrap.ts        # Wire up all packages
│   │
│   └── web/                        # Vue3 admin UI
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.ts
│           ├── App.vue
│           ├── router.ts
│           ├── api/                # API client
│           │   └── index.ts
│           ├── views/
│           │   ├── Dashboard.vue   # Stats overview
│           │   ├── AgentList.vue   # Agent cards/table
│           │   ├── AgentEdit.vue   # Agent config form
│           │   ├── ToolList.vue    # Tool registry viewer
│           │   ├── SkillList.vue   # Skill management
│           │   ├── Sessions.vue    # Conversation browser
│           │   └── SessionDetail.vue # Conversation replay
│           ├── components/
│           │   ├── Layout.vue      # Sidebar + header layout
│           │   ├── AgentCard.vue
│           │   ├── MessageBubble.vue
│           │   └── StatsChart.vue
│           └── styles/
│               └── global.css
```

---

## Database Schema

```sql
-- Agent 配置
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  system_prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  max_iterations INTEGER DEFAULT 15,
  streaming INTEGER DEFAULT 0,        -- boolean
  tools TEXT DEFAULT '[]',             -- JSON array of tool names
  skills TEXT DEFAULT '[]',            -- JSON array of skill names
  enabled INTEGER DEFAULT 1,           -- boolean
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- API Keys (每个 Agent 可有多个 key，支持轮换)
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,              -- SHA-256 hash of the key
  key_prefix TEXT NOT NULL,            -- First 8 chars for display: "af-xxxx..."
  name TEXT DEFAULT 'default',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT
);

-- 对话 Session
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 对话消息
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                  -- 'user' | 'assistant' | 'tool'
  content TEXT NOT NULL,               -- text or JSON ContentBlock[]
  model TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  tool_calls TEXT,                     -- JSON: tool_use blocks
  created_at TEXT DEFAULT (datetime('now'))
);

-- 用量日志 (每次 API 调用一条)
CREATE TABLE usage_logs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  model TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Skill 元数据
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  content TEXT NOT NULL,               -- Full markdown content
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## Chunk 1: Foundation — Types + Database + Monorepo Scaffold

### Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`

- [x] **Step 1: Initialize root monorepo config**

Root `package.json` with pnpm workspaces, `turbo.json` with build pipeline, shared `tsconfig.base.json`.

- [x] **Step 2: Create types package skeleton**

`packages/types/package.json` with name `@agentforge/types`, `tsconfig.json` extending base.

- [x] **Step 3: Verify monorepo builds**

Run: `pnpm install && pnpm -r build`
Expected: Clean build with no errors.

- [x] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold monorepo with types package"
```

### Task 2: Type Definitions

**Files:**
- Create: `packages/types/src/index.ts`
- Create: `packages/types/src/agent.ts`
- Create: `packages/types/src/tool.ts`
- Create: `packages/types/src/skill.ts`
- Create: `packages/types/src/llm.ts`
- Create: `packages/types/src/message.ts`
- Create: `packages/types/src/database.ts`

- [x] **Step 1: Define all type interfaces**

All interfaces as specified in the architecture doc: AgentConfig, Tool, ToolResult, ToolExecutionContext, Skill, LLMProvider, LLMRequest, LLMResponse, LLMStreamChunk, Message, ContentBlock, Session, DatabaseAdapter.

- [x] **Step 2: Build types package**

Run: `cd packages/types && pnpm build`
Expected: Compiles with no errors, `dist/` contains `.d.ts` files.

- [x] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: define all core type interfaces"
```

### Task 3: Database Adapter

**Files:**
- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/src/index.ts`
- Create: `packages/database/src/adapter.ts`
- Create: `packages/database/src/sqlite.ts`
- Create: `packages/database/src/migrations.ts`
- Create: `packages/database/tests/sqlite.test.ts`

- [x] **Step 1: Write failing tests for database operations**

Tests for: createAgent, getAgent, listAgents, updateAgent, deleteAgent, createSession, addMessage, getMessages, logUsage, getUsageStats, CRUD skills, CRUD apiKeys.

- [x] **Step 2: Run tests to verify they fail**

Run: `cd packages/database && pnpm test`
Expected: All tests FAIL (modules not found).

- [x] **Step 3: Implement DatabaseAdapter abstract class**

Abstract class with all method signatures.

- [x] **Step 4: Implement SQLiteAdapter**

Using `better-sqlite3`. Implements all methods. Includes migration logic to create tables on init.

- [x] **Step 5: Run tests to verify they pass**

Run: `cd packages/database && pnpm test`
Expected: All tests PASS.

- [x] **Step 6: Add PostgreSQL and MySQL stubs**

Stub classes that throw "Not implemented yet" — just to prove the adapter pattern works. These are placeholders for future implementation.

- [x] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: database adapter with SQLite implementation"
```

---

## Chunk 2: LLM Providers + Tool System + Skill System

### Task 4: LLM Provider Layer

**Files:**
- Create: `packages/providers/package.json`
- Create: `packages/providers/tsconfig.json`
- Create: `packages/providers/src/index.ts`
- Create: `packages/providers/src/claude.ts`
- Create: `packages/providers/src/openai.ts`
- Create: `packages/providers/src/factory.ts`
- Create: `packages/providers/tests/factory.test.ts`

- [x] **Step 1: Write tests for provider factory**

Test that `createProvider("claude", { apiKey })` returns a ClaudeProvider, `createProvider("openai", { apiKey, baseUrl })` returns an OpenAIProvider.

- [x] **Step 2: Implement ClaudeProvider**

Using `@anthropic-ai/sdk`. Implements `chat()` and `stream()` methods. Properly maps between internal types and Anthropic SDK types.

- [x] **Step 3: Implement OpenAIProvider**

Using `openai` SDK. Implements `chat()` and `stream()`. Maps between internal types and OpenAI types.

- [x] **Step 4: Implement provider factory**

`createProvider(type, config)` that returns the right provider.

- [x] **Step 5: Run tests**

Run: `cd packages/providers && pnpm test`
Expected: Factory tests PASS.

- [x] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: LLM provider layer with Claude and OpenAI support"
```

### Task 5: Tool System

**Files:**
- Create: `packages/tools/package.json`
- Create: `packages/tools/tsconfig.json`
- Create: `packages/tools/src/index.ts`
- Create: `packages/tools/src/registry.ts`
- Create: `packages/tools/src/executor.ts`
- Create: `packages/tools/src/builtin/index.ts`
- Create: `packages/tools/src/builtin/weather.ts`
- Create: `packages/tools/src/builtin/calculate.ts`
- Create: `packages/tools/src/builtin/time.ts`
- Create: `packages/tools/tests/registry.test.ts`
- Create: `packages/tools/tests/executor.test.ts`

- [x] **Step 1: Write tests for ToolRegistry**

Tests: register, get, list, filter by names, duplicate registration error.

- [x] **Step 2: Implement ToolRegistry**

Map-based registry. `register(tool)`, `get(name)`, `list()`, `getByNames(names[])`.

- [x] **Step 3: Write tests for ToolExecutor**

Tests: execute tool, before/after hooks, tool policy (allow/deny), unknown tool error.

- [x] **Step 4: Implement ToolExecutor**

Runs hooks, checks policy, calls `tool.execute()`, returns result.

- [x] **Step 5: Implement 3 demo builtin tools**

Weather (mock data), Calculator (safe eval), Time (timezone).

- [x] **Step 6: Run all tests**

Run: `cd packages/tools && pnpm test`
Expected: All PASS.

- [x] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: tool system with registry, executor, and demo tools"
```

### Task 6: Skill System

**Files:**
- Create: `packages/skills/package.json`
- Create: `packages/skills/tsconfig.json`
- Create: `packages/skills/src/index.ts`
- Create: `packages/skills/src/registry.ts`
- Create: `packages/skills/src/parser.ts`
- Create: `packages/skills/src/matcher.ts`
- Create: `packages/skills/tests/parser.test.ts`
- Create: `packages/skills/tests/registry.test.ts`
- Create: `skills/demo-skill.md` (example skill file)

- [x] **Step 1: Write tests for skill parser**

Tests: parse frontmatter (name, description) + markdown body from .md file.

- [x] **Step 2: Implement skill parser**

Parse `---\nname: ...\ndescription: ...\n---\n<body>` format.

- [x] **Step 3: Write tests for SkillRegistry**

Tests: register, get by name, list, match by keyword.

- [x] **Step 4: Implement SkillRegistry**

Uses parser. CRUD from database. `match(query)` returns best-match skill.

- [x] **Step 5: Create demo skill .md file**

A sample skill following Claude Code format.

- [x] **Step 6: Run tests**

Run: `cd packages/skills && pnpm test`
Expected: All PASS.

- [x] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: skill system with Claude Code style .md parsing"
```

---

## Chunk 3: Agent Loop (Core)

### Task 7: Agent Loop

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/agent-loop.ts`
- Create: `packages/core/src/context.ts`
- Create: `packages/core/src/token-utils.ts`
- Create: `packages/core/tests/agent-loop.test.ts`
- Create: `packages/core/tests/context.test.ts`

- [x] **Step 1: Write tests for ContextBuilder**

Tests: builds system prompt from agent config, appends skill instructions, manages conversation history, estimates token count.

- [x] **Step 2: Implement ContextBuilder**

Combines agent's systemPrompt + matched skill instructions + conversation history. Estimates tokens. Truncates old messages when over budget.

- [x] **Step 3: Implement token estimation utils**

Simple char-based estimation (~4 chars per token).

- [x] **Step 4: Write tests for AgentLoop**

Tests (with mocked LLM provider):
- Simple text response (no tools)
- Single tool call → tool result → final response
- Multiple tool calls in one turn
- Max iterations reached → stops
- Streaming mode yields chunks

- [x] **Step 5: Implement AgentLoop**

The core think-act-observe loop:
1. Build context
2. Call LLM (chat or stream based on config)
3. If tool_use → execute tools → loop
4. If end_turn → return response
5. Respect maxIterations
6. Track token usage
7. Persist messages to database

- [x] **Step 6: Run tests**

Run: `cd packages/core && pnpm test`
Expected: All PASS.

- [x] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: agent loop with context management and streaming support"
```

---

## Chunk 4: API Server

### Task 8: Server Bootstrap + Auth

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/app.ts`
- Create: `packages/server/src/config.ts`
- Create: `packages/server/src/auth.ts`
- Create: `packages/server/src/bootstrap.ts`
- Create: `packages/server/tests/auth.test.ts`

- [x] **Step 1: Write auth tests**

Tests: valid API key passes, invalid key returns 401, disabled key returns 403, key resolves to correct agent.

- [x] **Step 2: Implement config loader**

Read from env vars: `DATABASE_TYPE`, `DATABASE_URL`, `LLM_PROVIDER`, `LLM_API_KEY`, `PORT`, `ADMIN_SECRET`.

- [x] **Step 3: Implement auth middleware**

Fastify preHandler that checks `Authorization: Bearer <key>`, hashes it, looks up in api_keys table, resolves agent.

- [x] **Step 4: Implement bootstrap**

Wire up: database adapter → tool registry → skill registry → LLM provider → ready for routes.

- [x] **Step 5: Run auth tests**

Expected: All PASS.

- [x] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: server bootstrap with API key authentication"
```

### Task 9: API Routes — Agents CRUD

**Files:**
- Create: `packages/server/src/routes/agents.ts`
- Create: `packages/server/tests/routes/agents.test.ts`

- [x] **Step 1: Write route tests**

Tests: POST create agent, GET list agents, GET single agent, PUT update agent, DELETE agent, auto-generate API key on create.

- [x] **Step 2: Implement agents routes**

```
POST   /api/agents          → create agent + generate API key
GET    /api/agents          → list all agents
GET    /api/agents/:id      → get single agent (with API key prefix)
PUT    /api/agents/:id      → update agent config
DELETE /api/agents/:id      → delete agent + cascade keys/sessions
POST   /api/agents/:id/keys → generate new API key
DELETE /api/agents/:id/keys/:keyId → revoke key
```

- [x] **Step 3: Run tests**

Expected: All PASS.

- [x] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: agents CRUD API routes"
```

### Task 10: API Routes — Chat

**Files:**
- Create: `packages/server/src/routes/chat.ts`
- Create: `packages/server/tests/routes/chat.test.ts`

- [x] **Step 1: Write chat route tests**

Tests: POST /api/chat returns response, creates session if none, reuses session, returns tool calls in response, streaming endpoint returns SSE.

- [x] **Step 2: Implement chat routes**

```
POST /api/chat          → { message, sessionId? } → { reply, sessionId, toolCalls, usage }
POST /api/chat/stream   → SSE stream (for streaming-enabled agents)
```

Auth via API key → resolves agent → runs AgentLoop → persists → returns.

- [x] **Step 3: Run tests**

Expected: All PASS.

- [x] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: chat API with session management and streaming"
```

### Task 11: API Routes — Sessions, Tools, Skills, Stats

**Files:**
- Create: `packages/server/src/routes/sessions.ts`
- Create: `packages/server/src/routes/tools.ts`
- Create: `packages/server/src/routes/skills.ts`
- Create: `packages/server/src/routes/stats.ts`

- [x] **Step 1: Implement sessions routes**

```
GET /api/sessions              → list sessions (filterable by agent_id)
GET /api/sessions/:id          → session detail
GET /api/sessions/:id/messages → full message history
DELETE /api/sessions/:id       → delete session
```

- [x] **Step 2: Implement tools routes**

```
GET /api/tools                 → list all registered tools with schemas
```

- [x] **Step 3: Implement skills routes**

```
GET    /api/skills             → list skills
POST   /api/skills             → create skill (from markdown)
PUT    /api/skills/:id         → update skill
DELETE /api/skills/:id         → delete skill
```

- [x] **Step 4: Implement stats routes**

```
GET /api/stats                 → aggregate usage stats
GET /api/stats/agents/:id      → per-agent stats
GET /api/stats/daily           → daily breakdown
```

- [x] **Step 5: Write and run tests for all routes**

Expected: All PASS.

- [x] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: sessions, tools, skills, and stats API routes"
```

---

## Chunk 5: Vue3 Admin UI

### Task 12: Vue3 Project Setup

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/src/main.ts`
- Create: `packages/web/src/App.vue`
- Create: `packages/web/src/router.ts`
- Create: `packages/web/src/api/index.ts`
- Create: `packages/web/src/styles/global.css`

- [x] **Step 1: Scaffold Vue3 + Vite + Element Plus + Vue Router**

- [x] **Step 2: Setup API client with axios**

Base URL configurable, all endpoints wrapped.

- [x] **Step 3: Create Layout component**

Sidebar navigation (Dashboard, Agents, Tools, Skills, Sessions) + header with title.

- [x] **Step 4: Verify dev server starts**

Run: `cd packages/web && pnpm dev`
Expected: Vite dev server runs, shows layout shell.

- [x] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Vue3 admin UI scaffold with layout and router"
```

### Task 13: Dashboard + Stats Page

**Files:**
- Create: `packages/web/src/views/Dashboard.vue`
- Create: `packages/web/src/components/StatsChart.vue`

- [x] **Step 1: Implement Dashboard view**

Overview cards: total agents, total sessions today, total tokens today, active agents count. Daily usage chart (line chart via ECharts or Chart.js).

- [x] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: dashboard with stats overview and charts"
```

### Task 14: Agent Management Pages

**Files:**
- Create: `packages/web/src/views/AgentList.vue`
- Create: `packages/web/src/views/AgentEdit.vue`
- Create: `packages/web/src/components/AgentCard.vue`

- [x] **Step 1: Implement AgentList view**

Table/cards showing all agents. Status toggle (enabled/disabled). Copy API key button. Create/Edit/Delete actions.

- [x] **Step 2: Implement AgentEdit view**

Form with: name, description, system prompt (textarea), model selector, temperature slider, max tokens, max iterations, streaming toggle, tool multi-select, skill multi-select. Save/Cancel buttons.

- [x] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: agent list and edit pages"
```

### Task 15: Tool & Skill Management Pages

**Files:**
- Create: `packages/web/src/views/ToolList.vue`
- Create: `packages/web/src/views/SkillList.vue`

- [x] **Step 1: Implement ToolList view**

Read-only table of registered tools. Shows name, description, parameter schema (collapsible JSON viewer).

- [x] **Step 2: Implement SkillList view**

Table of skills. Create/Edit dialog with markdown editor. Preview rendered markdown. Enable/disable toggle. Delete action.

- [x] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: tool and skill management pages"
```

### Task 16: Session & Conversation Pages

**Files:**
- Create: `packages/web/src/views/Sessions.vue`
- Create: `packages/web/src/views/SessionDetail.vue`
- Create: `packages/web/src/components/MessageBubble.vue`

- [x] **Step 1: Implement Sessions view**

Table of sessions, filterable by agent. Shows session ID, agent name, message count, last activity. Click to view detail.

- [x] **Step 2: Implement SessionDetail view**

Chat-style conversation replay. MessageBubble component shows user/assistant/tool messages differently. Tool calls show name + input + result in collapsible blocks.

- [x] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: session browser and conversation replay"
```

---

## Chunk 6: Docker + Integration + Polish

### Task 17: Static File Serving

**Files:**
- Modify: `packages/server/src/app.ts`

- [x] **Step 1: Add @fastify/static to serve Vue build output**

In production, serve `packages/web/dist/` at `/`. API routes at `/api/*`. SPA fallback for Vue Router.

- [x] **Step 2: Add build script**

Root `pnpm build` builds all packages + Vue frontend.

- [x] **Step 3: Verify end-to-end**

Build everything, start server, visit `http://localhost:3000`, see admin UI.

- [x] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: serve Vue admin UI as static files in production"
```

### Task 18: Docker Setup

**Files:**
- Create: `docker/Dockerfile`
- Create: `docker/docker-compose.yml`
- Create: `.dockerignore`

- [x] **Step 1: Write multi-stage Dockerfile**

Stage 1: Node.js build (pnpm install + build all packages).
Stage 2: Production image (copy dist + node_modules, expose port).

- [x] **Step 2: Write docker-compose.yml**

Service: `agentforge` with env vars for config. Volume for SQLite data. Port mapping.

- [x] **Step 3: Test Docker build and run**

Run: `docker compose up --build`
Expected: Service starts, admin UI accessible at `http://localhost:3000`.

- [x] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: Docker setup with multi-stage build"
```

### Task 19: Integration Test

**Files:**
- Create: `tests/integration/full-flow.test.ts`

- [x] **Step 1: Write end-to-end integration test**

1. Start server
2. Create agent via API
3. Get API key
4. Send chat message via API key
5. Verify response received
6. Check session created
7. Check messages persisted
8. Check usage logged
9. Verify stats endpoint returns data

- [x] **Step 2: Run integration test**

Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add -A && git commit -m "test: end-to-end integration test"
```

### Task 20: README + Final Polish

**Files:**
- Create: `README.md`
- Create: `.env.example`

- [x] **Step 1: Write README**

Quick start (Docker), configuration reference, API documentation, how to add custom tools, how to write skills.

- [x] **Step 2: Create .env.example**

```
DATABASE_TYPE=sqlite
DATABASE_URL=./data/agentforge.db
LLM_PROVIDER=claude
LLM_API_KEY=sk-ant-...
PORT=3000
ADMIN_SECRET=change-me
```

- [x] **Step 3: Final build + test verification**

Run: `pnpm install && pnpm build && pnpm test`
Expected: All builds pass, all tests pass.

- [x] **Step 4: Commit**

```bash
git add -A && git commit -m "docs: README, env example, and final polish"
```

---

## Execution Notes

- **From AgentClaw**: Reference `d:\mycode\agentclaw\packages\{types,providers,core,tools}` for proven patterns. Extract, simplify, adapt — don't copy verbatim.
- **Testing**: vitest for all packages. Use mocked LLM providers in tests (never call real API in tests).
- **Each task is independently deployable**: after Task 11 the API is fully functional without UI.
- **Admin auth**: ADMIN_SECRET env var, checked via `X-Admin-Secret` header on management endpoints. Chat endpoints use per-agent API keys.
