# AgentForge

统一的 AI Agent 服务平台。Docker 一键部署，Vue3 管理后台，各业务线通过 API Key 调用 Agent。

## 核心能力

- **多 Provider** — 同时配置豆包、DeepSeek、Claude、OpenAI 等，每个 Agent 独立选择 Provider + Model
- **Provider Failover** — 主 Provider 故障自动切换备用，60 秒冷却后恢复
- **知识库（RAG）** — 上传文档，自动分块 + 向量化（火山引擎 Embedding），混合搜索（向量 60% + BM25 40%）
- **HTTP API Tools** — 无需写代码，通过管理界面配置外部 API 为 Agent 工具，热加载无需重启
- **上下文压缩** — 长对话自动截断旧 tool 结果 + 超出 token 预算时裁剪历史
- **流式输出** — SSE 实时流式返回，Test Chat 支持流式展示
- **Skill 系统** — Markdown 格式定义 Agent 行为，自动匹配注入 system prompt
- **用量追踪** — 每次调用记录 tokens（输入/输出/缓存命中）、耗时、模型，Dashboard 提供多维度统计

## Quick Start

### Docker（推荐）

```bash
cp .env.example .env
# 编辑 .env，填入 LLM API Key 和 ADMIN_SECRET

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
| `LLM_PROVIDER` | `claude` | 初始 Provider 类型：`claude` / `openai` |
| `LLM_API_KEY` | — | LLM API Key（必填） |
| `LLM_BASE_URL` | — | OpenAI 兼容 API 地址（豆包、DeepSeek 等） |
| `DEFAULT_MODEL` | `claude-sonnet-4-20250514` | 默认模型 |
| `DATABASE_TYPE` | `sqlite` | 数据库：`sqlite` / `postgresql` / `mysql` |
| `DATABASE_URL` | `./data/agentforge.db` | 数据库连接地址 |
| `ADMIN_SECRET` | `admin` | 管理后台密钥（生产环境必须修改） |
| `PORT` | `3000` | 服务端口 |
| `CORS_ORIGIN` | `true` | CORS 允许的域名（生产环境设置具体域名） |
| `LOG_LEVEL` | `info` | 日志级别 |
| `VOLCANO_EMBEDDING_KEY` | — | 火山引擎 Embedding API Key（知识库向量化） |
| `VOLCANO_EMBEDDING_MODEL` | `doubao-embedding-vision-250615` | Embedding 模型 |

## 管理后台

| 页面 | 功能 |
|------|------|
| **Dashboard** | 总量统计（Sessions/Requests/Tokens）、趋势图（7/30/90天）、按模型/Agent 用量分布 |
| **Agents** | 创建/编辑 Agent（Provider、Model、System Prompt、温度、工具白名单、Skill） |
| **Providers** | 管理多个 LLM Provider（添加/启用/禁用/设主力），API Key 脱敏显示 |
| **Tools** | 查看内置工具，配置 HTTP API Tools（CRUD + 在线测试） |
| **Skills** | 查看/导入 Skill（Markdown 格式） |
| **Sessions** | 会话列表（首条消息预览、token 统计、缓存命中率），点击查看完整对话回放 |
| **Knowledge** | Agent 编辑页 → Knowledge Tab：上传文档，查看/删除知识源 |
| **Test Chat** | Agent 编辑页 → Test Chat Tab：实时对话测试（支持流式），显示 token 用量 |

## 知识库（RAG）

上传文档后，Agent 自动具备基于文档回答的能力：

1. 管理后台 → Agent → Knowledge Tab → Upload File（.txt/.md/.csv/.json 等）
2. 文档自动分块（500 字符，100 字符重叠，段落/句子感知）
3. 如配置 `VOLCANO_EMBEDDING_KEY`，自动调用 Embedding API 生成向量
4. 搜索采用混合策略：向量语义相似度（60%）+ BM25 关键词匹配（40%）
5. Agent 对话时自动调用 `search_knowledge` 工具检索相关文档片段

无 Embedding 配置时降级为纯 BM25 关键词搜索。

## API

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
```

### 管理接口（X-Admin-Secret 认证）

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
| **Providers** | | |
| POST | `/api/providers` | 添加 Provider |
| GET | `/api/providers` | 列出 Provider |
| PUT | `/api/providers/:id` | 更新 Provider |
| DELETE | `/api/providers/:id` | 删除 Provider |
| **Knowledge** | | |
| POST | `/api/agents/:id/knowledge` | 上传知识文档 |
| GET | `/api/agents/:id/knowledge` | 列出知识源 |
| POST | `/api/agents/:id/knowledge/search` | 搜索知识库 |
| DELETE | `/api/agents/:id/knowledge/:name` | 删除知识源 |
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
| GET | `/api/stats/daily?days=30` | 每日统计 |
| GET | `/api/stats/models` | 按模型统计 |
| GET | `/api/stats/agents` | 按 Agent 统计 |
| **Other** | | |
| GET | `/api/skills` | Skill 列表 |
| GET | `/health` | 健康检查 |

## 项目结构

```
packages/
├── types/        TypeScript 接口定义（零运行时依赖）
├── database/     数据库适配器（SQLite / PostgreSQL / MySQL）
├── providers/    LLM Provider（Claude / OpenAI 兼容）
├── tools/        工具系统（注册表、执行器、内置工具、HTTP 工具、知识搜索、Embedding）
├── skills/       Skill 系统（Markdown 解析/匹配/注册）
├── core/         Agent Loop + 上下文管理 + 压缩
├── server/       Fastify API + Provider Failover + SSE
└── web/          Vue3 + Element Plus 管理后台
```

## 安全特性

- Admin Secret 生产环境强制配置（未设置启动报错）
- CORS 可配置（`CORS_ORIGIN` 环境变量）
- 日志脱敏（Authorization / Admin-Secret header 不打印）
- LLM 请求 60 秒超时，HTTP 请求 120 秒超时
- Provider API Key 掩码显示（仅显示末 4 位）
- 数据库索引优化（api_keys、sessions、messages、usage_logs）
- Docker healthcheck（`/health` 端点）

## 测试

```bash
pnpm test    # 107 个单元测试
```

## License

MIT
