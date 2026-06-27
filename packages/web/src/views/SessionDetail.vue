<template>
  <div>
    <div class="page-header">
      <h2>{{ t("sessionDetail.title") }}</h2>
      <div class="header-actions">
        <el-button :icon="CopyDocument" @click="copyAsJson">{{ t("sessionDetail.copyJson") }}</el-button>
        <el-button type="primary" :loading="rerunning" @click="rerunCurrentSession">{{ t("sessionDetail.rerun") }}</el-button>
        <el-button @click="$router.back()">{{ t("common.back") }}</el-button>
      </div>
    </div>

    <el-card v-loading="loading">
      <div class="chat-container">
        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="['message', `message-${msg.role}`]"
        >
          <div class="message-header">
            <span class="message-role">{{ roleLabel(msg.role) }}</span>
            <span class="message-time" v-if="msg.createdAt">{{ formatTime(msg.createdAt) }}</span>
          </div>
          <div class="message-content">
            <div v-if="msg.thinking" class="thinking-block">
              <div class="thinking-header" @click="toggleThinking(msg.id)">
                <el-icon style="margin-right: 4px">
                  <CaretRight v-if="!msg.thinkingExpanded" />
                  <CaretBottom v-else />
                </el-icon>
                <span>{{ t("sessionDetail.thinking") }}</span>
                <el-tag size="small" type="warning" style="margin-left: 8px">{{ t("sessionDetail.extendedThinking") }}</el-tag>
              </div>
              <div v-if="msg.thinkingExpanded" class="thinking-body">{{ msg.thinking }}</div>
            </div>
            <template v-if="typeof msg.content === 'string'">
              {{ msg.content }}
            </template>
            <template v-else>
              <div v-for="(block, i) in msg.content" :key="i">
                <div v-if="block.type === 'text'">{{ block.text }}</div>
                <div v-else-if="block.type === 'image'" class="image-block">
                  <img
                    v-if="block.source?.type === 'base64'"
                    :src="`data:${block.source.mediaType || 'image/png'};base64,${block.source.data}`"
                    class="chat-image"
                  />
                  <img
                    v-else-if="block.source?.type === 'url'"
                    :src="block.source.url"
                    class="chat-image"
                  />
                </div>
                <details v-else-if="block.type === 'tool_use'" class="tool-inline">
                  <summary>
                    <el-tag type="warning" size="small">{{ block.name }}</el-tag>
                    <span class="tool-preview">{{ toolPreview(block.input) }}</span>
                  </summary>
                  <pre class="json-block">{{ JSON.stringify(block.input, null, 2) }}</pre>
                </details>
                <details v-else-if="block.type === 'tool_result'" class="tool-inline">
                  <summary>
                    <el-tag :type="block.isError ? 'danger' : 'success'" size="small">{{ t("sessionDetail.result") }}</el-tag>
                    <span class="tool-preview">{{ (block.content || '').slice(0, 80) }}{{ (block.content || '').length > 80 ? '...' : '' }}</span>
                  </summary>
                  <pre class="json-block">{{ prettyJson(block.content) }}</pre>
                </details>
              </div>
            </template>
          </div>
          <div class="message-meta" v-if="msg.tokensIn || msg.tokensOut || msg.model">
            <span v-if="msg.model">{{ t("sessionDetail.model") }} {{ msg.model }}</span>
            <span v-if="msg.model && (msg.tokensIn || msg.tokensOut)"> · </span>
            <span v-if="msg.tokensIn || msg.tokensOut">
              {{ t("sessionDetail.tokens") }} {{ (msg.tokensIn ?? 0).toLocaleString() }}↓ {{ (msg.tokensOut ?? 0).toLocaleString() }}↑
            </span>
            <span v-if="msg.cacheReadTokens" style="color: #67c23a"> · {{ msg.cacheReadTokens.toLocaleString() }} {{ t("sessions.cache") }}</span>
            <span v-if="msg.durationMs"> · {{ msg.durationMs }}ms</span>
            <el-tag v-if="msg.modelTrace?.fallbackUsed" size="small" type="warning" class="fallback-tag">{{ t("sessionDetail.fallback") }}</el-tag>
          </div>
          <details v-if="msg.modelTrace" class="model-trace">
            <summary>{{ modelTraceSummary(msg.modelTrace) }}</summary>
            <div
              v-for="(attempt, index) in msg.modelTrace.attempts"
              :key="`${attempt.providerId}-${attempt.model}-${attempt.attempt}-${index}`"
              :class="['trace-attempt', `trace-${attempt.status}`]"
            >
              <span>{{ attempt.providerId }}/{{ attempt.model }} #{{ attempt.attempt }}</span>
              <el-tag size="small" :type="attempt.status === 'success' ? 'success' : attempt.status === 'skipped' ? 'info' : 'danger'">
                {{ attempt.status }}
              </el-tag>
              <span v-if="attempt.error" class="trace-error">{{ attempt.error }}</span>
            </div>
          </details>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getSessionMessages, rerunSession } from "@/api";
import { ElMessage } from "element-plus";
import { CaretRight, CaretBottom, CopyDocument } from "@element-plus/icons-vue";
import { formatTime } from "@/utils/format";
import { t } from "@/i18n";

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  isError?: boolean;
  toolUseId?: string;
  source?: { type: string; mediaType?: string; data?: string; url?: string };
}

interface ModelTraceAttempt {
  providerId: string;
  model: string;
  attempt: number;
  status: "success" | "failed" | "skipped";
  error?: string;
}

interface ModelTrace {
  requestedModel: string;
  selectedProviderId?: string;
  selectedModel?: string;
  fallbackUsed: boolean;
  attempts: ModelTraceAttempt[];
}

interface ChatMessage {
  id: string;
  role: string;
  content: string | ContentBlock[];
  thinking?: string;
  thinkingExpanded?: boolean;
  model?: string;
  modelTrace?: ModelTrace;
  tokensIn?: number;
  tokensOut?: number;
  cacheReadTokens?: number;
  durationMs?: number;
  createdAt?: string;
}

const route = useRoute();
const router = useRouter();
const messages = ref<ChatMessage[]>([]);
const loading = ref(false);
const rerunning = ref(false);

function roleLabel(role: string) {
  const map: Record<string, string> = {
    user: t("sessionDetail.user"),
    assistant: t("sessionDetail.assistant"),
    tool: t("sessionDetail.tool"),
  };
  return map[role] || role;
}

function toggleThinking(msgId: string) {
  const msg = messages.value.find((m) => m.id === msgId);
  if (msg) msg.thinkingExpanded = !msg.thinkingExpanded;
}

function toolPreview(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  const vals = Object.values(input).map(v => typeof v === "string" ? v : JSON.stringify(v));
  const preview = vals.join(", ");
  return preview.length > 80 ? preview.slice(0, 80) + "..." : preview;
}

function prettyJson(raw: unknown): string {
  if (typeof raw !== "string") return String(raw ?? "");
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function modelTraceSummary(trace: ModelTrace): string {
  const selected = trace.selectedProviderId && trace.selectedModel
    ? `${trace.selectedProviderId}/${trace.selectedModel}`
    : trace.selectedModel ?? "unknown";
  return trace.fallbackUsed
    ? `${t("sessionDetail.modelTrace")} ${t("sessionDetail.fallbackTo", { model: selected })}`
    : `${t("sessionDetail.modelTrace")} ${selected}`;
}

const ROLE_ORDER: Record<string, number> = { assistant: 0, tool: 1, user: 2 };

function sortMessages(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.sort((a, b) => {
    const ta = a.createdAt ?? "";
    const tb = b.createdAt ?? "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
  });
}

async function loadMessages() {
  loading.value = true;
  try {
    const { data } = await getSessionMessages(route.params.id as string);
    const parsed = (data as ChatMessage[]).map((m) => ({
      ...m,
      content: typeof m.content === "string" ? tryParse(m.content) : m.content,
      thinkingExpanded: false,
    }));
    messages.value = sortMessages(parsed);
  } catch {
    ElMessage.error(t("sessionDetail.failedLoad"));
  } finally {
    loading.value = false;
  }
}

function buildExportJson(): object[] {
  return messages.value.map((msg) => {
    const entry: Record<string, unknown> = {
      role: msg.role,
      content: msg.content,
    };
    if (msg.thinking) entry.thinking = msg.thinking;
    if (msg.model) entry.model = msg.model;
    if (msg.modelTrace) entry.modelTrace = msg.modelTrace;
    if (msg.createdAt) entry.createdAt = msg.createdAt;
    if (msg.tokensIn) entry.tokensIn = msg.tokensIn;
    if (msg.tokensOut) entry.tokensOut = msg.tokensOut;
    if (msg.cacheReadTokens) entry.cacheReadTokens = msg.cacheReadTokens;
    if (msg.durationMs) entry.durationMs = msg.durationMs;
    return entry;
  });
}

async function copyAsJson() {
  try {
    const json = JSON.stringify(buildExportJson(), null, 2);
    await navigator.clipboard.writeText(json);
    ElMessage.success(t("common.copied"));
  } catch {
    ElMessage.error(t("common.copyFailed"));
  }
}

async function rerunCurrentSession() {
  rerunning.value = true;
  try {
    const { data } = await rerunSession(route.params.id as string);
    ElMessage.success(t("sessionDetail.rerunCreated"));
    router.push(`/sessions/${data.sessionId}`);
  } catch (error: unknown) {
    const message = (error as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
      ?? (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      ?? t("sessionDetail.failedRerun");
    ElMessage.error(message);
  } finally {
    rerunning.value = false;
  }
}

function tryParse(s: string): string | ContentBlock[] {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : s;
  } catch {
    return s;
  }
}

onMounted(loadMessages);
</script>

<style scoped>
.header-actions {
  display: flex;
  gap: 8px;
}
.chat-container {
  max-width: 800px;
  margin: 0 auto;
}
.message {
  margin-bottom: 16px;
  padding: 12px 16px;
  border-radius: 8px;
}
.message-user {
  background: #ecf5ff;
  margin-left: 40px;
}
.message-assistant {
  background: #f0f9eb;
  margin-right: 40px;
}
.message-tool {
  background: #fdf6ec;
  margin-right: 40px;
}
.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.message-role {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
}
.message-time {
  font-size: 11px;
  color: #c0c4cc;
}
.message-content {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.message-meta {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 6px;
}
.fallback-tag {
  margin-left: 6px;
}
.model-trace {
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
}
.model-trace summary {
  cursor: pointer;
  user-select: none;
}
.trace-attempt {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding-left: 12px;
  word-break: break-word;
}
.trace-success {
  color: #16a34a;
}
.trace-failed {
  color: #dc2626;
}
.trace-skipped {
  color: #64748b;
}
.trace-error {
  color: #64748b;
}
.tool-inline {
  margin: 4px 0;
  font-size: 13px;
}
.tool-inline summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  list-style: none;
}
.tool-inline summary::-webkit-details-marker { display: none; }
.tool-inline summary::before {
  content: "\25B6";
  font-size: 10px;
  color: #c0c4cc;
  transition: transform 0.15s;
}
.tool-inline[open] summary::before {
  transform: rotate(90deg);
}
.tool-preview {
  color: #909399;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
}
.json-block {
  font-size: 12px;
  margin-top: 4px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow: auto;
  background: rgba(0, 0, 0, 0.02);
  padding: 8px;
  border-radius: 4px;
}
.thinking-block {
  margin-bottom: 8px;
  border: 1px solid #e6a23c;
  border-radius: 6px;
  overflow: hidden;
  font-size: 12px;
}
.thinking-header {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: #fdf6ec;
  color: #e6a23c;
  cursor: pointer;
  user-select: none;
  font-weight: 500;
}
.thinking-header:hover {
  background: #faecd8;
}
.thinking-body {
  padding: 8px;
  background: #fff;
  color: #606266;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
  line-height: 1.6;
}
.image-block {
  margin: 8px 0;
}
.chat-image {
  max-width: 300px;
  max-height: 300px;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  cursor: pointer;
}
</style>
