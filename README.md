# AgentForge

统一的 AI Agent 服务平台。Docker 一键部署，Vue3 管理后台，各业务线通过 API Key 调用 Agent。

## 核心能力

- **多模型** — 同时配置豆包、DeepSeek、Claude、OpenAI 等，每个 Agent 独立选择模型（Model = Provider + 默认模型名）
- **Model Failover** — 主模型故障自动切换备用模型，记录 fallback trace，冷却后恢复
- **模型能力声明** — 每个 Model 声明 tools / vision / thinking / streaming 能力，Agent 配置和运行时会跳过不兼容候选
- **分类管理** — Agent、HTTP Tool、Skill 支持 Category，便于多业务线管理
- **知识库（RAG）** — 上传文档，自动分块（中英文句子感知） + 向量化（火山引擎 Embedding），混合搜索（向量 60% + BM25 40%），支持原始内容在线编辑与重切片
- **HTTP API Tools** — 无需写代码，通过管理界面配置外部 API 为 Agent 工具，热加载无需重启
- **OpenAI 兼容渠道** — 每个 Model 可创建独立 Channel API Key，兼容 `/v1/chat/completions`，并统计渠道用量
- **企业租户地基** — 支持 Organization / Workspace / User / Membership / Identity Provider 配置 / Audit Log，为私有云企业部署和后续 OIDC/SAML/飞书等身份接入打基础
- **多语言后台** — 管理后台支持中文、日语、英文，右上角可切换，默认跟随浏览器语言
- **上下文压缩** — 长对话自动截断旧 tool 结果 + 超出 token 预算时裁剪历史
- **流式输出** — SSE 实时流式返回，Test Chat 支持流式展示
- **AI 思考过程** — 支持 Extended Thinking（Claude）和 Reasoning Content（豆包等），可折叠展示思考过程
- **Skill 系统（Lazy Injection）** — Markdown 格式定义 Skill，启动时仅注入目录摘要到 System Prompt，AI 按需通过 `get_skill_content` 工具加载详细内容（SKILL.md / template / examples / references），大幅节省 token
- **图片支持** — 对话支持图片发送（base64 / URL），多模态模型自动识别
- **用量追踪** — 每次调用记录 tokens（输入/输出/缓存命中）、耗时、模型，Dashboard 提供多维度统计

## Quick Start

### Docker（推荐）

```bash
cp .env.example .env
# 编辑 .env，填入 LLM API Key；生产环境必须替换 ADMIN_EMAIL / ADMIN_PASSWORD

cd docker
docker compose up --build -d

# 访问管理后台
open http://localhost:3000
```

### 本地开发

```bash
pnpm install
cp .env.example .env
pnpm build
pnpm dev
# 后台: http://localhost:5173  API: http://localhost:3000
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_PROVIDER` | `claude` | 初始模型类型：`claude` / `openai` |
| `LLM_API_KEY` | — | LLM API Key（必填） |
| `LLM_BASE_URL` | — | OpenAI 兼容 API 地址（豆包、DeepSeek 等） |
| `DEFAULT_MODEL` | `claude-sonnet-4-20250514` | 默认模型 |
| `DB_PATH` | `data/agentforge.db` | SQLite 数据库文件路径；兼容读取旧变量 `DATABASE_URL` |
| `ADMIN_EMAIL` | `demo@example.com` | 首个本地管理员账号；本地开发默认演示账号 |
| `ADMIN_PASSWORD` | `password` | 本地开发默认演示密码；生产环境必须替换，且会拒绝 `password` / `admin` / `change-me-in-production` |
| `AUTH_SESSION_DAYS` | `7` | 登录会话有效天数 |
| `ADMIN_SECRET` | `admin` | 管理 API 兼容兜底密钥；生产环境必须设置或迁移到正式 IdP |
| `PORT` | `3000` | 服务端口 |
| `CORS_ORIGIN` | `true` | CORS 允许的域名（生产环境设置具体域名） |
| `LOG_LEVEL` | `info` | 日志级别 |
| `VOLCANO_EMBEDDING_KEY` | — | 火山引擎 Embedding API Key（知识库向量化） |
| `VOLCANO_EMBEDDING_MODEL` | `doubao-embedding-vision-250615` | Embedding 模型 |

## 管理后台

后台使用本地账号登录，首次启动会自动创建 `ADMIN_EMAIL` 指定的管理员并加入默认 Organization / Workspace。开发环境常见演示账号是 `demo@example.com` / `password`，这也是国外 SaaS demo、starter kit、admin template 里最常见的写法之一；生产环境必须在 `.env` 中替换。登录后浏览器使用 HttpOnly session cookie 访问管理 API；`X-Admin-Secret` 只保留给自动化、迁移和紧急维护。

| 页面 | 功能 |
|------|------|
| **Dashboard** | 总量统计（Sessions/Requests/Tokens）、趋势图（今天/昨天/7/30/90天/自定义日期范围）、按模型/Agent/渠道用量分布，柱状图和表格统一联动筛选 |
| **Agents** | 创建/编辑 Agent（Model、Fallback Models、Category、System Prompt、温度、工具白名单、Skill、Extended Thinking），Model 由 Models 页配置，Agent 只需选择 |
| **Models** | 管理多个 LLM 模型（添加/启用/禁用/设主力、能力声明、Channel API Key），API Key 脱敏显示。每个 Model 对应一个 Provider + 固定模型名 |
| **Tools** | 查看内置工具，配置 HTTP API Tools（CRUD + 在线测试） |
| **Skills** | 卡片列表 / 文件编辑器（创建/删除/重命名 Skill 及其文件和文件夹） |
| **Sessions** | 会话列表（首条消息预览、token 统计），Session Detail 紧凑展示工具调用 |
| **Knowledge** | Agent 编辑页 → Knowledge Tab：上传文档、查看/编辑原始内容（自动重切片）、重命名/删除 |
| **Test Chat** | Agent 编辑页 → Test Chat Tab：全屏聊天窗口、工具栏固定底部，支持流式 + 图片，显示 token 用量 + 思考过程 |

## Skill 系统

Skill 采用 **Lazy Injection** 模式，解决传统全量注入的 token 浪费问题：

1. **启动时**：仅加载 Skill 的 `name` + `description` + 文件清单
2. **请求时**：将绑定 Skill 的目录摘要（约 100-200 token）注入 System Prompt
3. **按需加载**：AI 根据用户问题判断是否需要调用 `get_skill_content` 工具加载详细内容
4. **精细粒度**：支持加载单个文件（`SKILL.md` / `examples/xxx.md` / `references/xxx.md`）或全部内容

```
skills/
├── code-review/
│   ├── SKILL.md               # 主指令（frontmatter: name + description）
│   ├── examples/              # 示例文件
│   │   └── php-review.md
│   └── references/            # 参考资料
│       └── common-vulnerabilities.md
└── data-analysis/
    ├── SKILL.md
    ├── examples/
    └── references/
```

## 知识库（RAG）

上传文档后，Agent 自动具备基于文档回答的能力：

1. 管理后台 → Agent → Knowledge Tab → Upload File（.txt/.md/.csv/.json 等）
2. 文档自动分块（500 字符，100 字符重叠，中英文段落/句子感知 — 支持 `。！？` 和 `. ` 分句）
3. 原始内容保存在 `knowledge_sources` 表，可随时在线编辑，保存后自动重新切片
4. 如配置 `VOLCANO_EMBEDDING_KEY`，自动调用 Embedding API 生成向量
5. 搜索采用混合策略：向量语义相似度（60%）+ BM25 关键词匹配（40%）
6. Agent 对话时自动调用 `search_knowledge` 工具检索相关文档片段（仅在 Agent 有知识库时注入）

无 Embedding 配置时降级为纯 BM25 关键词搜索。

## API

### 管理接口（登录会话 / 兼容 Admin Secret）

管理端浏览器请求使用登录 Cookie。自动化脚本仍可临时使用 `X-Admin-Secret`。P0 企业租户地基提供以下基础资源，后续 OIDC/SAML/飞书/企业微信/钉钉/GitHub 登录都会接入同一套 Organization / Workspace / Membership / Audit Log 模型。

工作区选择支持三种方式，优先级从高到低：

1. `X-Workspace-Id` header
2. `workspaceId` query
3. JSON body 中的 `workspaceId`

如果都不传，系统会自动使用默认工作区。Agent、Model/Channel、HTTP Tool、Skill Category、Knowledge Base、Session、Usage、Proxy Usage 都按 workspace 隔离。

```bash
curl http://localhost:3000/api/tenant/bootstrap \
  -H "X-Admin-Secret: your-admin-secret"
```

本地账号接口：

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

主要租户接口：

- `GET /api/tenant/bootstrap`
- `GET/POST /api/organizations`
- `GET/POST /api/organizations/:organizationId/workspaces`
- `GET/POST /api/users`
- `GET/POST /api/organizations/:organizationId/memberships`
- `GET/POST /api/organizations/:organizationId/identity-providers`
- `GET /api/organizations/:organizationId/audit-logs`

### 对话接口（API Key 认证）

```bash
# 非流式
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer af-your-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "sessionId": "optional-session-id"}'

# 流式（SSE）
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Authorization: Bearer af-your-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'

# 携带图片
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer af-your-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "描述这张图", "images": [{"type": "base64", "mediaType": "image/jpeg", "data": "..."}]}'
```

### 管理接口（登录会话或 X-Admin-Secret）

| 方法 | 路径 | 说明 |
|------|------|------|
| **Agents** | | |
| POST | `/api/agents` | 创建 Agent |
| GET | `/api/agents` | 列出 Agent |
| PUT | `/api/agents/:id` | 更新 Agent |
| DELETE | `/api/agents/:id` | 删除 Agent |
| POST | `/api/agents/:id/keys` | 生成 API Key |
| DELETE | `/api/agents/:id/keys/:keyId` | 吊销 API Key |
| POST | `/api/agents/:id/chat` | 测试对话（Admin） |
| POST | `/api/agents/:id/chat/stream` | 流式测试对话（Admin） |
| **Models (Providers)** | | |
| POST | `/api/providers` | 添加模型 |
| GET | `/api/providers` | 列出模型 |
| PUT | `/api/providers/:id` | 更新模型 |
| DELETE | `/api/providers/:id` | 删除模型 |
| **Knowledge** | | |
| POST | `/api/agents/:id/knowledge` | 上传知识文档 |
| GET | `/api/agents/:id/knowledge` | 列出知识源 |
| GET | `/api/agents/:id/knowledge/:name/content` | 获取原始内容 |
| PUT | `/api/agents/:id/knowledge/:name/content` | 更新原始内容（自动重切片） |
| PATCH | `/api/agents/:id/knowledge/:name` | 重命名知识源 |
| POST | `/api/agents/:id/knowledge/search` | 搜索知识库 |
| DELETE | `/api/agents/:id/knowledge/:name` | 删除知识源 |
| **Skills** | | |
| GET | `/api/skills` | Skill 列表 |
| POST | `/api/skills` | 创建 Skill |
| DELETE | `/api/skills/:name` | 删除 Skill |
| PATCH | `/api/skills/:name/rename` | 重命名 Skill |
| GET | `/api/skills/:name/files` | 列出 Skill 文件 |
| GET | `/api/skills/:name/files/*` | 获取文件内容 |
| PUT | `/api/skills/:name/files/*` | 保存文件 |
| DELETE | `/api/skills/:name/files/*` | 删除文件 |
| PATCH | `/api/skills/:name/files/rename` | 重命名文件/文件夹 |
| **Tools** | | |
| GET | `/api/tools` | 工具列表 |
| POST | `/api/http-tools` | 创建 HTTP Tool |
| GET | `/api/http-tools` | 列出 HTTP Tools |
| PUT | `/api/http-tools/:id` | 更新 HTTP Tool |
| DELETE | `/api/http-tools/:id` | 删除 HTTP Tool |
| **Sessions** | | |
| GET | `/api/sessions` | 会话列表 |
| GET | `/api/sessions/:id/messages` | 会话消息 |
| DELETE | `/api/sessions/:id` | 删除会话 |
| **Stats** | | |
| GET | `/api/stats` | 总览统计 |
| GET | `/api/stats/daily?days=30` | 每日统计（支持 `startDate` / `endDate` 自定义日期范围） |
| GET | `/api/stats/models` | 按模型统计（支持 `startDate` / `endDate`） |
| GET | `/api/stats/agents` | 按 Agent 统计（支持 `startDate` / `endDate`） |
| **Other** | | |
| GET | `/health` | 健康检查 |

## 项目结构

```
packages/
├── types/        TypeScript 接口定义（零运行时依赖）
├── database/     数据库适配器（SQLite，自动迁移）
├── providers/    LLM 模型适配（Claude / OpenAI 兼容，含 thinking 支持）
├── tools/        工具系统（注册表、执行器、内置工具、HTTP 工具、知识搜索、Skill 内容加载、Embedding）
├── skills/       Skill 系统（Markdown 解析、注册、文件扫描）
├── core/         Agent Loop + 上下文管理（Skill Catalog 注入）+ 压缩
├── server/       Fastify API + Model Failover + SSE + 文件编辑
└── web/          Vue3 + Element Plus 管理后台
skills/           Skill 数据目录（每个子目录一个 Skill）
```

## 术语说明

前端管理界面统一使用 **"Model"** 一词，因为每个模型配置已绑定固定的模型名。后端 API 路径仍保留 `/api/providers`（历史兼容），但含义等同于 "Model"。Agent 创建时只需选择 Model，不再需要单独指定模型名。

## 安全特性

- Admin Secret 生产环境强制配置（未设置启动报错）
- CORS 可配置（`CORS_ORIGIN` 环境变量）
- 日志脱敏（Authorization / Admin-Secret header 不打印）
- LLM 请求 60 秒超时，HTTP 请求 120 秒超时
- 模型 API Key 掩码显示（仅显示末 4 位）
- 数据库索引优化（api_keys、sessions、messages、usage_logs）
- Docker healthcheck（`/health` 端点）
- Skill / Knowledge 文件操作均有路径穿越防护

## 维护与验证

后续维护请先阅读 `AGENTS.md`，详细检查清单见 `docs/MAINTENANCE.md`。

统一验证入口：

```bash
./scripts/verify.sh
```

等价于顺序运行：

```bash
pnpm build
pnpm test
```

前端文案必须通过 `packages/web/src/i18n.ts` 维护，并同时补齐中文、日语、英文。交付前应保持构建无 Vite chunk size warning，测试无 `punycode` deprecation warning；UI 改动还需要浏览器检查主要页面和 console。

## License

MIT
