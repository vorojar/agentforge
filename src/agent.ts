/**
 * agent.ts — 基于 Claude Agent SDK 的自定义 Agent（非流式版本）
 *
 * 核心概念：
 * - Messages API 是无状态的，每次请求需要发送完整对话历史
 * - 当 Claude 返回 stop_reason === "tool_use" 时，需要执行工具并把结果送回
 * - Agent 循环就是不断重复「请求 → 检查 → 执行工具 → 送回结果」直到 Claude 说完话
 *
 * 运行方式：
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   npx tsx src/agent.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { tools, executeTool } from "./tools.js";
import * as readline from "node:readline";

// ============================================================
// 1. 初始化 SDK
// ============================================================

const client = new Anthropic({
  // apiKey 默认从环境变量 ANTHROPIC_API_KEY 读取
  // 也可以显式传入：apiKey: "sk-ant-..."
});

// 模型选择：
// - claude-sonnet-4-20250514: 速度与智能的最佳平衡（推荐）
// - claude-opus-4-20250514:   最强智能，适合复杂推理
// - claude-haiku-3-5-20241022:  最快速度，适合简单任务
const MODEL = "claude-sonnet-4-20250514";

// 系统提示词 — 定义 Agent 的角色和行为
const SYSTEM_PROMPT = `你是一个多功能 AI 助手。你可以：
- 查询天气信息
- 进行数学计算
- 查看世界各地的时间

请用中文回答用户的问题。当需要使用工具时，直接调用，不需要征求许可。
如果用户的问题不需要工具，直接用你的知识回答即可。`;

// ============================================================
// 2. Agent 循环 — 核心逻辑
// ============================================================

/**
 * 执行一轮完整的 Agent 对话。
 *
 * 流程：
 * 1. 把用户消息加入对话历史
 * 2. 调用 Claude API
 * 3. 如果 Claude 想用工具 → 执行工具 → 把结果送回 → 回到步骤 2
 * 4. 如果 Claude 直接回复文本 → 返回文本，结束本轮
 */
async function runAgent(
  userMessage: string,
  conversationHistory: Anthropic.MessageParam[]
): Promise<string> {
  // 把用户消息加入历史
  conversationHistory.push({ role: "user", content: userMessage });

  // Agent 循环：持续运行直到 Claude 完成回复
  while (true) {
    console.log("\n  ⏳ 正在思考...");

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages: conversationHistory,
    });

    // 打印 token 使用量（便于监控成本）
    console.log(
      `  📊 Token: 输入 ${response.usage.input_tokens}, 输出 ${response.usage.output_tokens}`
    );

    // ---- 情况 A：Claude 完成回复（end_turn）----
    if (response.stop_reason === "end_turn") {
      // 把助手回复加入历史
      conversationHistory.push({ role: "assistant", content: response.content });

      // 提取文本内容
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );
      return textBlocks.map((b) => b.text).join("\n");
    }

    // ---- 情况 B：Claude 想使用工具（tool_use）----
    if (response.stop_reason === "tool_use") {
      // 把助手的工具调用加入历史
      conversationHistory.push({ role: "assistant", content: response.content });

      // 找出所有工具调用（Claude 可能一次调用多个工具）
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      // 逐个执行工具，收集结果
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        console.log(`  🔧 调用工具: ${toolUse.name}`);
        console.log(`     参数: ${JSON.stringify(toolUse.input)}`);

        const result = executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );
        console.log(`     结果: ${result}`);

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // 把工具结果作为 user 消息送回（这是 API 的约定）
      conversationHistory.push({ role: "user", content: toolResults });

      // 继续循环，让 Claude 处理工具结果
      continue;
    }

    // ---- 情况 C：达到 max_tokens 或其他原因 ----
    conversationHistory.push({ role: "assistant", content: response.content });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return text || "(回复被截断)";
  }
}

// ============================================================
// 3. 交互式对话入口
// ============================================================

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   Claude Agent SDK Demo — 自定义 Agent  ║");
  console.log("╠════════════════════════════════════════╣");
  console.log("║  可用工具: 天气查询 / 数学计算 / 时间查询  ║");
  console.log("║  输入 exit 退出                         ║");
  console.log("╚════════════════════════════════════════╝\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // 对话历史在整个 session 中持续累积
  const history: Anthropic.MessageParam[] = [];

  const ask = () => {
    rl.question("👤 你: ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed === "exit") {
        console.log("\n再见！👋");
        rl.close();
        return;
      }

      try {
        const reply = await runAgent(trimmed, history);
        console.log(`\n🤖 助手: ${reply}\n`);
      } catch (error) {
        console.error("\n❌ 错误:", (error as Error).message, "\n");
      }

      ask();
    });
  };

  ask();
}

main();
