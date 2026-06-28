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
- **企业设置与登录** — 私有化部署默认就是客户自己的企业；管理台提供业务空间、账号、成员角色、企业登录和审计日志，本地账号可直接使用，也可接入 OIDC、飞书、企业微信、钉钉等企业登录
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

docker compose -f docker/docker-compose.yml up --build -d

# 访问管理后台
open http://localhost:3000
```

Docker Compose 会同时启动 AgentForge 和 PostgreSQL。生产私有云也可以把 `.env` 改成客户已有的 `POSTGRES_URL` 或 `POSTGRES_HOST` / `POSTGRES_*`，但运行数据库只支持 PostgreSQL。

### 本地开发

```bash
pnpm install
cp .env.example .env
pnpm build
pnpm dev
# 后台: http://localhost:5173  API: http://localhost:3000
```

### 生产部署自检

私有云上线前先在目标环境运行：

```bash
NODE_ENV=production pnpm preflight:prod
```

自检会阻塞默认 `ADMIN_SECRET`、演示密码、缺失 `LLM_API_KEY`、未开启 `AUTH_COOKIE_SECURE`、不安全 `CORS_ORIGIN`、缺失 `PUBLIC_URL` 和未配置 PostgreSQL 等问题。Docker 部署必须显式设置 `POSTGRES_PASSWORD`、`ADMIN_SECRET`、`ADMIN_EMAIL`、`ADMIN_PASSWORD`、`AUTH_COOKIE_SECURE=true`、`CORS_ORIGIN=https://...` 和 `PUBLIC_URL=https://...`。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_PROVIDER` | `claude` | 初始模型类型：`claude` / `openai` |
| `LLM_API_KEY` | — | LLM API Key（必填） |
| `LLM_BASE_URL` | — | OpenAI 兼容 API 地址（豆包、DeepSeek 等） |
| `DEFAULT_MODEL` | `claude-sonnet-4-20250514` | 默认模型 |
| `DB_TYPE` | `postgres` | 数据库类型；只支持 `postgres` / `postgresql` |
| `POSTGRES_URL` | — | PostgreSQL 连接 URL；也可使用 `DATABASE_URL=postgres://...` |
| `POSTGRES_HOST` / `POSTGRES_PORT` | `postgres` / `5432` | PostgreSQL 主机和端口 |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `agentforge` / — / `agentforge` | PostgreSQL 用户、密码和数据库名 |
| `POSTGRES_SSL` | `false` | 外部托管 PostgreSQL 需要 SSL 时设为 `true` |
| `POSTGRES_POOL_MAX` | `10` | 应用侧连接池最大连接数，客户已有 PgBouncer 时也建议保持小池 |
| `POSTGRES_IDLE_TIMEOUT_MS` / `POSTGRES_CONNECTION_TIMEOUT_MS` | `30000` / `5000` | 空闲连接回收与连接建立超时 |
| `ADMIN_EMAIL` | `demo@example.com` | 首个本地管理员账号；本地开发默认演示账号 |
| `ADMIN_PASSWORD` | `password` | 本地开发默认演示密码；生产环境必须替换，且会拒绝 `password` / `admin` / `change-me-in-production` |
| `AUTH_SESSION_DAYS` | `7` | 登录会话有效天数 |
| `AUTH_COOKIE_SECURE` | `false` | 生产 HTTPS 部署必须设为 `true` |
| `PUBLIC_URL` | — | 生产外部访问地址，用于 OIDC / OAuth callback URL，例如 `https://agentforge.example.com` |
| `ADMIN_SECRET` | `admin` | 管理 API 兼容兜底密钥；生产环境必须设置或迁移到正式 IdP |
| `PORT` | `3000` | 服务端口 |
| `CORS_ORIGIN` | `true` | CORS 允许的域名（生产环境设置具体域名） |
| `LOG_LEVEL` | `info` | 日志级别 |
| `VOLCANO_EMBEDDING_KEY` | — | 火山引擎 Embedding API Key（知识库向量化） |
| `VOLCANO_EMBEDDING_MODEL` | `doubao-embedding-vision-250615` | Embedding 模型 |

## 运维

生产升级前后使用同一组命令：

```bash
NODE_ENV=production pnpm preflight:prod
pnpm verify:postgres
pnpm backup:postgres
pnpm restore:postgres backups/agentforge-prod.sql.gz
```

完整备份、恢复、升级和回滚步骤见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。

## 上线与销售 Demo

私有云企业版发布前必须通过发布闸门：根目录 `./scripts/verify.sh`、目标环境 `NODE_ENV=production pnpm preflight:prod`、PostgreSQL migration smoke、备份/恢复演练、浏览器登录和企业设置 smoke。销售演示建议按同一条产品路径走：登录账号、左下角用户菜单、企业设置、企业登录、审计日志、Models fallback、Agents/Test Chat、最后解释私有云运维闭环。

完整上线验收和销售 demo 脚本见 [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)。

商业交付材料：

- [docs/COMMERCIAL_READINESS.md](docs/COMMERCIAL_READINESS.md)：商业可交付目标和验收矩阵。
- [docs/CUSTOMER_DELIVERY.md](docs/CUSTOMER_DELIVERY.md)：客户 IT 部署、预检、备份、恢复、升级、回滚清单。
- [docs/PRICING.md](docs/PRICING.md)：销售打包、报价单位和买方叙事建议。

演示环境可重复重置：

```bash
pnpm demo:reset
pnpm demo:seed
pnpm demo:status
```

## 管理后台

后台使用本地账号登录，首次启动会自动创建 `ADMIN_EMAIL` 指定的管理员并加入默认企业和默认业务空间。开发环境常见演示账号是 `demo@example.com` / `password`，这也是国外 SaaS demo、starter kit、admin template 里最常见的写法之一；生产环境必须在 `.env` 中替换。登录后浏览器使用 HttpOnly session cookie 访问管理 API；`X-Admin-Secret` 只保留给自动化、迁移和紧急维护。

### 企业登录

本地账号开箱即用，企业登录是可选接入项，用于连接客户公司已经在用的 Google Workspace、Microsoft Entra ID、Okta、Auth0、Keycloak、飞书、企业微信、钉钉等系统。技术上这些登录方式仍存放在后端 Identity Provider 模型中。支持两类登录：

- `type: "oidc"`：Google Workspace、Microsoft Entra ID、Okta、Auth0、Keycloak、GitHub Enterprise 等标准 OIDC。回调地址是 `https://your-domain/api/auth/oidc/:providerId/callback`。
- `type: "oauth"`：飞书、企业微信、钉钉。回调地址是 `https://your-domain/api/auth/oauth/:providerId/callback`。

OAuth provider 配置约定：

- `provider: "feishu"`：`clientId` 填应用 ID，`clientSecretRef` 填 `env:<your env var>`；默认授权地址、token 地址和 user_info 地址已内置，也可用 `ssoUrl` 覆盖授权地址、用 `issuerUrl` 覆盖 token 地址。
- `provider: "wecom"`：`clientId` 填企业 ID，`clientSecretRef` 填 `env:<your env var>`，并在 `claimMapping.agentId` 填应用 AgentId。
- `provider: "dingtalk"`：`clientId` 填应用 Client ID，`clientSecretRef` 填 `env:<your env var>`；默认使用 `openid` scope。

飞书、企微、钉钉如果没有返回邮箱，可以在 `claimMapping.emailDomain` 配置企业域名，系统会用 provider 用户 ID 派生内部登录邮箱。OAuth 登录成功后会自动创建用户、赋予默认 Workspace 的 viewer 权限，并写入 `auth.oauth_login` audit log。

| 页面 | 功能 |
|------|------|
| **Dashboard** | 总量统计（Sessions/Requests/Tokens）、趋势图（今天/昨天/7/30/90天/自定义日期范围）、按模型/Agent/渠道用量分布，柱状图和表格统一联动筛选 |
| **Agents** | 创建/编辑 Agent（Model、Fallback Models、Category、System Prompt、温度、工具白名单、Skill、Extended Thinking），Model 由 Models 页配置，Agent 只需选择 |
| **Models** | 管理多个 LLM 模型（添加/启用/禁用/设主力、能力声明、Channel API Key），API Key 脱敏显示。每个 Model 对应一个 Provider + 固定模型名 |
| **Tools** | 查看内置工具，配置 HTTP API Tools（CRUD + 在线测试） |
| **Skills** | 卡片列表 / 文件编辑器（创建/删除/重命名 Skill 及其文件和文件夹） |
| **Sessions** | 会话列表（首条消息预览、token 统计），Session Detail 紧凑展示工具调用 |
| **Knowledge** | Agent 编辑页 → Knowledge Tab：上传文档、查看/编辑原始内容（自动重切片）、重命名/删除 |
| **Enterprise Settings** | 管理业务空间、账号、成员角色、企业登录和审计日志；后端 Organization / Identity Provider 模型由系统维护，不暴露成普通客户的日常任务 |
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

管理端浏览器请求使用登录 Cookie。自动化脚本仍可临时使用 `X-Admin-Secret`。企业设置背后仍使用 Organization / Workspace / Membership / Audit Log 等租户地基，OIDC、飞书、企业微信、钉钉等企业登录都会接入同一套权限和审计模型。

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
- `GET /api/auth/oidc/:providerId/start`
- `GET /api/auth/oidc/:providerId/callback`
- `GET /api/auth/oauth/:providerId/start`
- `GET /api/auth/oauth/:providerId/callback`

主要企业设置接口：

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
├── database/     PostgreSQL 数据库适配器与自动迁移
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
