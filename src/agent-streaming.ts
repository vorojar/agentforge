/**
 * agent-streaming.ts — 流式版本的 Agent
 *
 * 与 agent.ts 的区别：
 * - 使用 client.messages.stream() 代替 client.messages.create()
 * - 文本实时逐字输出，体验更流畅
 * - 通过事件监听获取流式数据
 *
 * 运行方式：
 *   npx tsx src/agent-streaming.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { tools, executeTool } from "./tools.js";
import * as readline from "node:readline";

const client = new Anthropic();
const MODEL = "claude-sonnet-4-20250514";

const SYSTEM_PROMPT = `你是一个多功能 AI 助手。你可以查询天气、进行计算、查看时间。
请用中文回答。需要工具时直接调用。`;

// ============================================================
// 流式 Agent 循环
// ============================================================

async function runStreamingAgent(
  userMessage: string,
  history: Anthropic.MessageParam[]
): Promise<string> {
  history.push({ role: "user", content: userMessage });

  while (true) {
    // 使用 .stream() 获取流式响应
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages: history,
    });

    // 实时输出文本片段
    process.stdout.write("\n🤖 助手: ");
    stream.on("text", (text) => {
      process.stdout.write(text);
    });

    // 等待流结束，获取完整消息
    const finalMessage = await stream.finalMessage();

    console.log(
      `\n  📊 Token: 输入 ${finalMessage.usage.input_tokens}, 输出 ${finalMessage.usage.output_tokens}`
    );

    // ---- end_turn：对话结束 ----
    if (finalMessage.stop_reason === "end_turn") {
      history.push({ role: "assistant", content: finalMessage.content });
      const text = finalMessage.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return text;
    }

    // ---- tool_use：执行工具 ----
    if (finalMessage.stop_reason === "tool_use") {
      history.push({ role: "assistant", content: finalMessage.content });

      const toolUseBlocks = finalMessage.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        console.log(`\n  🔧 ${toolUse.name}(${JSON.stringify(toolUse.input)})`);
        const result = executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );
        console.log(`     → ${result}`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      history.push({ role: "user", content: toolResults });
      continue;
    }

    // ---- 其他情况 ----
    history.push({ role: "assistant", content: finalMessage.content });
    return "(回复结束)";
  }
}

// ============================================================
// 入口
// ============================================================

async function main() {
  console.log("🌊 流式 Agent 已启动（输入 exit 退出）\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const history: Anthropic.MessageParam[] = [];

  const ask = () => {
    rl.question("\n👤 你: ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed === "exit") {
        console.log("再见！👋");
        rl.close();
        return;
      }

      try {
        await runStreamingAgent(trimmed, history);
      } catch (error) {
        console.error("❌ 错误:", (error as Error).message);
      }

      ask();
    });
  };

  ask();
}

main();
