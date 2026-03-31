<template>
  <div>
    <div class="page-header">
      <h2>Session Detail</h2>
      <el-button @click="$router.back()">Back</el-button>
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
            <template v-if="typeof msg.content === 'string'">
              {{ msg.content }}
            </template>
            <template v-else>
              <div v-for="(block, i) in msg.content" :key="i">
                <div v-if="block.type === 'image'" style="margin: 8px 0">
                  <img v-if="block.source?.type === 'base64'"
                    :src="`data:${block.source.mediaType};base64,${block.source.data}`"
                    style="max-width: 300px; max-height: 300px; border-radius: 8px" />
                  <img v-else-if="block.source?.type === 'url'"
                    :src="block.source.url"
                    style="max-width: 300px; max-height: 300px; border-radius: 8px" />
                </div>
                <details v-else-if="block.type === 'thinking'" class="thinking-block">
                  <summary>
                    <span style="color: #909399; font-size: 12px">💭 Thinking</span>
                  </summary>
                  <div style="color: #909399; font-size: 13px; padding: 8px; background: #f9f9f9; border-radius: 4px; margin-top: 4px; white-space: pre-wrap">{{ block.text }}</div>
                </details>
                <div v-else-if="block.type === 'text'">{{ block.text }}</div>
                <details v-else-if="block.type === 'tool_use'" class="tool-inline">
                  <summary>
                    <el-tag type="warning" size="small">{{ block.name }}</el-tag>
                    <span class="tool-preview">{{ toolPreview(block.input) }}</span>
                  </summary>
                  <pre class="json-block">{{ JSON.stringify(block.input, null, 2) }}</pre>
                </details>
                <details v-else-if="block.type === 'tool_result'" class="tool-inline">
                  <summary>
                    <el-tag :type="block.isError ? 'danger' : 'success'" size="small">Result</el-tag>
                    <span class="tool-preview">{{ (block.content || '').slice(0, 80) }}{{ (block.content || '').length > 80 ? '...' : '' }}</span>
                  </summary>
                  <pre class="json-block">{{ block.content }}</pre>
                </details>
              </div>
            </template>
          </div>
          <div class="message-meta" v-if="msg.tokensIn || msg.tokensOut">
            Tokens: {{ msg.tokensIn }}↓ {{ msg.tokensOut }}↑
            <span v-if="msg.durationMs"> · {{ msg.durationMs }}ms</span>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { getSessionMessages } from "@/api";
import { ElMessage } from "element-plus";
import { formatTime } from "@/utils/format";

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  isError?: boolean;
  toolUseId?: string;
  source?: { type: string; data?: string; mediaType?: string; url?: string };
}

interface ChatMessage {
  id: string;
  role: string;
  content: string | ContentBlock[];
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  createdAt?: string;
}

const route = useRoute();
const messages = ref<ChatMessage[]>([]);
const loading = ref(false);

function roleLabel(role: string) {
  const map: Record<string, string> = { user: "User", assistant: "Assistant", tool: "Tool" };
  return map[role] || role;
}

function toolPreview(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  const vals = Object.values(input).map(v => typeof v === "string" ? v : JSON.stringify(v));
  const preview = vals.join(", ");
  return preview.length > 80 ? preview.slice(0, 80) + "..." : preview;
}

async function loadMessages() {
  loading.value = true;
  try {
    const { data } = await getSessionMessages(route.params.id as string);
    messages.value = (data as ChatMessage[]).map((m) => ({
      ...m,
      content: typeof m.content === "string" ? tryParse(m.content) : m.content,
    }));
  } catch {
    ElMessage.error("Failed to load messages");
  } finally {
    loading.value = false;
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
  content: "▶";
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
</style>
