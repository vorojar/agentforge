# Claude Agent SDK 自定义 Agent 示例

使用 [Claude Agent SDK](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)（`@anthropic-ai/sdk`）构建一个带工具调用能力的自定义 AI Agent。

## 环境要求

| 依赖 | 版本 |
|------|------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| Anthropic API Key | [获取地址](https://console.anthropic.com/) |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 设置 API Key（PowerShell）
$env:ANTHROPIC_API_KEY = "sk-ant-..."

# 或 Bash/Zsh:
# export ANTHROPIC_API_KEY=sk-ant-...

# 3. 运行（二选一）
npm start                # 非流式版本
npm run start:streaming  # 流式版本（逐字输出）
```

## 项目结构

```
├── src/
│   ├── tools.ts              # 工具定义 + 执行器
│   ├── agent.ts              # 非流式 Agent（入门推荐）
│   └── agent-streaming.ts    # 流式 Agent（更好的交互体验）
├── package.json
├── tsconfig.json
└── README.md
```

## 关键概念

### 1. Agent 循环（Agentic Loop）

Claude Messages API 是**无状态**的——每次请求必须发送完整对话历史。Agent 循环的核心逻辑：

```
用户输入 → 调用 Claude API → 检查 stop_reason
  ├─ "end_turn"  → 输出文本，结束
  ├─ "tool_use"  → 执行工具 → 送回结果 → 再次调用 API（循环）
  └─ "max_tokens"→ 输出截断文本，结束
```

### 2. 工具定义（Tool Definition）

工具使用 JSON Schema 格式定义，包含名称、描述和参数结构：

```typescript
const tools: Anthropic.Tool[] = [
  {
    name: "get_weather",
    description: "获取指定城市的天气",
    input_schema: {
      type: "object",
      properties: {
        city: { type: "string", description: "城市名称" }
      },
      required: ["city"]
    }
  }
];
```

### 3. 工具调用流程

当 Claude 决定使用工具时，API 返回的 `stop_reason` 为 `"tool_use"`，响应内容中包含 `ToolUseBlock`：

```typescript
// Claude 返回的工具调用
{ type: "tool_use", id: "toolu_xxx", name: "get_weather", input: { city: "北京" } }

// 你执行工具后，以 tool_result 格式送回
{ type: "tool_result", tool_use_id: "toolu_xxx", content: "北京: 22°C, 晴" }
```

**注意**：工具结果必须放在 `role: "user"` 的消息中，这是 API 的协议约定。

### 4. 流式响应（Streaming）

使用 `client.messages.stream()` 获取实时输出：

```typescript
const stream = client.messages.stream({ model, max_tokens, tools, messages });

// 监听文本片段
stream.on("text", (text) => process.stdout.write(text));

// 获取完整消息（用于检查 stop_reason）
const finalMessage = await stream.finalMessage();
```

### 5. 对话历史管理

对话历史是一个 `MessageParam[]` 数组，严格交替 `user` → `assistant`：

```
user: "北京天气怎么样？"
assistant: [ToolUseBlock { name: "get_weather", input: { city: "北京" } }]
user: [ToolResultBlock { tool_use_id: "...", content: "22°C, 晴" }]
assistant: [TextBlock { text: "北京现在22°C，天气晴朗。" }]
```

## 可用模型

| 模型 | 特点 | 适用场景 |
|------|------|---------|
| `claude-sonnet-4-20250514` | 速度与智能平衡 | 通用 Agent（推荐） |
| `claude-opus-4-20250514` | 最强智能 | 复杂推理、多步规划 |
| `claude-haiku-3-5-20241022` | 最快速度 | 简单任务、高吞吐 |

## 扩展思路

- **添加新工具**：在 `tools.ts` 中定义新工具并实现执行逻辑
- **持久化对话**：将 `history` 序列化到文件或数据库
- **接入真实 API**：替换模拟的天气数据为 OpenWeatherMap 等
- **错误重试**：在 API 调用外层加 retry 逻辑处理限流
- **上下文管理**：当对话过长时，截断或压缩历史消息

## License

MIT
