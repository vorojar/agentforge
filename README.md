# AgentForge

统一的 AI Agent 服务平台。一个可 Docker 部署的服务，包含后端 API + Vue3 管理后台。各业务线通过管理后台创建 Agent，通过 API Key 调用。

## Quick Start

### 方式 1：Docker（推荐）

```bash
# 克隆项目
cd agentforge

# 配置
cp .env.example .env
# 编辑 .env，填入你的 LLM API Key

# 启动
cd docker
docker compose up --build -d

# 访问管理后台
open http://localhost:3000
```

### 方式 2：本地开发

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env

# 构建所有包
pnpm build

# 启动开发服务器（后端 + 前端 hot reload）
pnpm dev
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_TYPE` | `sqlite` | 数据库类型：`sqlite` / `postgresql` / `mysql` |
| `DATABASE_URL` | `./data/agentforge.db` | 数据库连接地址 |
| `LLM_PROVIDER` | `claude` | LLM 提供商：`claude` / `openai` |
| `LLM_API_KEY` | — | LLM API Key（必填） |
| `LLM_BASE_URL` | — | LLM API 地址（可选，OpenAI 兼容模型使用） |
| `PORT` | `3000` | 服务端口 |
| `ADMIN_SECRET` | `admin` | 管理后台认证密钥 |

## 架构

```
┌─────────────────────────────────────────────────┐
│                 AgentForge Server                │
│                                                  │
│  ┌──────────────┐    ┌────────────────────────┐  │
│  │  Vue3 管理后台 │    │     Fastify API         │  │
│  │  (静态文件)    │◄──►│ /api/agents /api/chat   │  │
│  └──────────────┘    └──────────┬─────────────┘  │
│                                 │                │
│  ┌──────────────────────────────▼──────────────┐ │
│  │  Agent Loop │ Tool System │ Skill System    │ │
│  │  LLM Provider │ Context Manager │ DB Layer  │ │
│  └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## API

### 对话接口（业务方调用）

通过 Agent 的 API Key 认证：

```bash
# 非流式对话
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer af-your-agent-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "北京天气怎么样？"}'

# 响应
{
  "reply": "北京现在22°C，天气晴朗。",
  "sessionId": "uuid-xxx",
  "toolCalls": [
    { "name": "get_weather", "input": {"city": "北京"}, "result": "北京: 22°C, 晴" }
  ],
  "usage": { "tokensIn": 150, "tokensOut": 50, "durationMs": 1200 }
}

# 流式对话（Agent 需开启 streaming）
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Authorization: Bearer af-your-agent-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "sessionId": "uuid-xxx"}'
# 返回 SSE 事件流
```

### 管理接口

通过 `X-Admin-Secret` 头认证：

```bash
# 创建 Agent
curl -X POST http://localhost:3000/api/agents \
  -H "X-Admin-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "客服助手",
    "systemPrompt": "你是一个专业的客服助手。",
    "model": "claude-sonnet-4-20250514",
    "tools": ["get_weather", "calculate", "get_time"]
  }'

# 列出所有 Agent
curl http://localhost:3000/api/agents -H "X-Admin-Secret: your-secret"

# 查看统计
curl http://localhost:3000/api/stats -H "X-Admin-Secret: your-secret"

# 查看对话历史
curl http://localhost:3000/api/sessions -H "X-Admin-Secret: your-secret"
```

完整 API 列表：

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/chat` | API Key | 对话 |
| POST | `/api/chat/stream` | API Key | 流式对话 |
| POST | `/api/agents` | Admin | 创建 Agent |
| GET | `/api/agents` | Admin | 列出 Agent |
| GET | `/api/agents/:id` | Admin | Agent 详情 |
| PUT | `/api/agents/:id` | Admin | 更新 Agent |
| DELETE | `/api/agents/:id` | Admin | 删除 Agent |
| POST | `/api/agents/:id/keys` | Admin | 生成 API Key |
| DELETE | `/api/agents/:id/keys/:keyId` | Admin | 吊销 API Key |
| GET | `/api/sessions` | Admin | 会话列表 |
| GET | `/api/sessions/:id/messages` | Admin | 会话消息 |
| DELETE | `/api/sessions/:id` | Admin | 删除会话 |
| GET | `/api/tools` | Admin | 工具列表 |
| GET | `/api/skills` | Admin | Skill 列表 |
| POST | `/api/skills` | Admin | 创建 Skill |
| PUT | `/api/skills/:id` | Admin | 更新 Skill |
| DELETE | `/api/skills/:id` | Admin | 删除 Skill |
| GET | `/api/stats` | Admin | 总览统计 |
| GET | `/api/stats/agents/:id` | Admin | Agent 统计 |
| GET | `/api/stats/daily` | Admin | 每日统计 |

## 添加自定义工具

在 `packages/tools/src/builtin/` 下创建新文件：

```typescript
import type { Tool } from "@agentforge/types";

export const myTool: Tool = {
  name: "my_tool",
  description: "工具描述",
  parameters: {
    type: "object",
    properties: {
      param1: { type: "string", description: "参数1" },
    },
    required: ["param1"],
  },
  async execute(input) {
    const result = doSomething(input.param1 as string);
    return { content: result };
  },
};
```

然后在 `packages/tools/src/builtin/index.ts` 中导出。

## 编写 Skill

Skill 遵循 Claude Code 的 `.md` 格式，通过管理后台创建：

```markdown
---
name: customer-service
description: 客服场景的对话技巧和规范
---

# 客服助手技能

## 基本原则
- 始终保持礼貌和专业
- 先确认用户的问题，再提供解决方案
```

Skill 的内容会在匹配时注入到 Agent 的 system prompt 中。

## 项目结构

```
packages/
├── types/        零运行时依赖的 TypeScript 接口定义
├── database/     数据库适配器（SQLite / PostgreSQL / MySQL）
├── providers/    LLM 提供商适配器（Claude / OpenAI）
├── tools/        工具注册表 + 执行器 + 内置工具
├── skills/       Skill 系统（解析/匹配/注册）
├── core/         Agent Loop + 上下文管理
├── server/       Fastify API 服务
└── web/          Vue3 管理后台
```

## 测试

```bash
# 运行所有单元测试
pnpm test

# 运行集成测试
npx vitest run tests/integration/
```

## License

MIT
