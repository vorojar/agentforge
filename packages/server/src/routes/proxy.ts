/**
 * Provider 独立转发路由
 * 功能：OpenAI 兼容格式的 LLM API 转发，支持渠道认证和用量统计
 * 创建时间：2026-03-31
 * 负责人：王觉贤
 */

import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../bootstrap.js";
import { createProvider } from "@agentforge/providers";

export async function proxyRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db } = opts.ctx;

  fastify.post("/v1/chat/completions", async (request, reply) => {
    const startTime = Date.now();

    // 渠道认证
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: { message: "Missing Bearer token", type: "invalid_request_error" } });
    }

    const rawKey = authHeader.slice(7);
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const channelResult = await db.getChannelByHash(keyHash);

    if (!channelResult) {
      return reply.code(401).send({ error: { message: "Invalid API key", type: "invalid_request_error" } });
    }

    const { providerConfig } = channelResult;
    if (!providerConfig.enabled) {
      return reply.code(403).send({ error: { message: "Provider is disabled", type: "invalid_request_error" } });
    }

    const body = request.body as {
      model?: string;
      messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
      top_p?: number;
      n?: number;
      stop?: string | string[];
    };

    if (!body.messages?.length) {
      return reply.code(400).send({ error: { message: "messages is required", type: "invalid_request_error" } });
    }

    const model = body.model || providerConfig.defaultModel;
    const provider = createProvider(providerConfig.type, {
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl,
    });

    // 转换 OpenAI 消息格式为内部格式
    const systemMsgs = body.messages.filter(m => m.role === "system");
    const nonSystemMsgs = body.messages.filter(m => m.role !== "system");
    const systemPrompt = systemMsgs.map(m => typeof m.content === "string" ? m.content : "").join("\n");

    const messages = nonSystemMsgs.map(m => ({
      role: m.role as "user" | "assistant",
      content: typeof m.content === "string" ? m.content : m.content.map(c => {
        if (c.type === "text") return { type: "text" as const, text: c.text ?? "" };
        return { type: "text" as const, text: "" };
      }),
    }));

    try {
      if (body.stream) {
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });

        const stream = provider.stream({
          model,
          systemPrompt,
          messages,
          maxTokens: body.max_tokens ?? 4096,
          temperature: body.temperature ?? 0.7,
        });

        const chatId = `chatcmpl-${Date.now()}`;
        let totalTokensIn = 0;
        let totalTokensOut = 0;

        for await (const chunk of stream) {
          if (chunk.type === "text" && chunk.text) {
            const sseData = {
              id: chatId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{ index: 0, delta: { content: chunk.text }, finish_reason: null }],
            };
            reply.raw.write(`data: ${JSON.stringify(sseData)}\n\n`);
          } else if (chunk.type === "done") {
            if (chunk.usage) {
              totalTokensIn = chunk.usage.tokensIn;
              totalTokensOut = chunk.usage.tokensOut;
            }
            const sseData = {
              id: chatId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            };
            reply.raw.write(`data: ${JSON.stringify(sseData)}\n\n`);
            reply.raw.write("data: [DONE]\n\n");
          }
        }

        reply.raw.end();

        const durationMs = Date.now() - startTime;
        await db.logProxyUsage({
          channelId: channelResult.id,
          providerId: providerConfig.id,
          model,
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
          durationMs,
        });

        return;
      }

      // 非流式
      const response = await provider.chat({
        model,
        systemPrompt,
        messages,
        maxTokens: body.max_tokens ?? 4096,
        temperature: body.temperature ?? 0.7,
      });

      const durationMs = Date.now() - startTime;
      await db.logProxyUsage({
        channelId: channelResult.id,
        providerId: providerConfig.id,
        model,
        tokensIn: response.usage.tokensIn,
        tokensOut: response.usage.tokensOut,
        durationMs,
      });

      const textContent = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map(b => b.text)
        .join("");

      return {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          message: { role: "assistant", content: textContent },
          finish_reason: response.stopReason === "end_turn" ? "stop" : response.stopReason,
        }],
        usage: {
          prompt_tokens: response.usage.tokensIn,
          completion_tokens: response.usage.tokensOut,
          total_tokens: response.usage.tokensIn + response.usage.tokensOut,
        },
      };
    } catch (error) {
      request.log.error(error, "Proxy forward failed");
      return reply.code(502).send({
        error: {
          message: (error as Error).message,
          type: "upstream_error",
        },
      });
    }
  });

  // 模型列表（兼容 OpenAI /v1/models）
  fastify.get("/v1/models", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: { message: "Missing Bearer token", type: "invalid_request_error" } });
    }

    const rawKey = authHeader.slice(7);
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const channelResult = await db.getChannelByHash(keyHash);
    if (!channelResult) {
      return reply.code(401).send({ error: { message: "Invalid API key", type: "invalid_request_error" } });
    }

    return {
      object: "list",
      data: [{
        id: channelResult.providerConfig.defaultModel,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: channelResult.providerConfig.type,
      }],
    };
  });
}
