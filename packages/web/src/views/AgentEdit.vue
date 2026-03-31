<template>
  <div>
    <div class="page-header">
      <h2>{{ isEdit ? form.name || "Agent" : "Create Agent" }}</h2>
      <el-button @click="$router.push('/agents')">Back</el-button>
    </div>

    <el-tabs v-model="activeTab" type="border-card" v-loading="loading">
      <!-- Tab 1: Basic Info -->
      <el-tab-pane label="Basic Info" name="basic">
        <el-form :model="form" label-width="140px" style="max-width: 700px">
          <el-form-item label="Name" required>
            <el-input v-model="form.name" placeholder="Agent name" />
          </el-form-item>

          <el-form-item label="Description">
            <el-input v-model="form.description" type="textarea" :rows="2" />
          </el-form-item>

          <el-form-item label="System Prompt" required>
            <el-input v-model="form.systemPrompt" type="textarea" :rows="8"
              placeholder="Define the agent's role and behavior..." />
          </el-form-item>

          <el-form-item label="Provider" required>
            <el-select v-model="form.providerId" style="width: 100%" placeholder="Select a provider"
              @change="onProviderChange">
              <el-option v-for="p in availableProviders" :key="p.id" :label="p.name" :value="p.id">
                <span>{{ p.name }}</span>
                <el-tag v-if="p.isPrimary" type="success" size="small" style="margin-left: 8px">Primary</el-tag>
              </el-option>
            </el-select>
          </el-form-item>

          <el-form-item label="Model" required>
            <el-select v-model="form.model" style="width: 100%" filterable allow-create default-first-option
              placeholder="Select or type a model name" :disabled="!form.providerId">
              <el-option v-if="selectedProviderModel" :label="selectedProviderModel + ' (default)'" :value="selectedProviderModel" />
            </el-select>
            <el-text v-if="!form.providerId" type="warning" size="small">Please select a provider first</el-text>
            <el-text v-else type="info" size="small">Can type any model name for this provider</el-text>
          </el-form-item>

          <el-form-item label="Temperature">
            <el-slider v-model="form.temperature" :min="0" :max="1" :step="0.1" show-input />
          </el-form-item>

          <el-form-item label="Max Tokens">
            <el-input-number v-model="form.maxTokens" :min="256" :max="32768" :step="256" />
          </el-form-item>

          <el-form-item label="Max Iterations">
            <el-input-number v-model="form.maxIterations" :min="1" :max="50" />
          </el-form-item>

          <el-form-item label="Streaming">
            <el-switch v-model="form.streaming" />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" @click="handleSave" :loading="saving">Save</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- Tab 2: Tools & Skills -->
      <el-tab-pane label="Tools & Skills" name="tools" :disabled="!isEdit">
        <div style="max-width: 700px">
          <h3 style="margin-bottom: 12px">Tool Whitelist</h3>
          <p style="color: #909399; font-size: 13px; margin-bottom: 12px">
            Select which tools this agent can use. Leave empty to allow all.
          </p>
          <el-checkbox-group v-model="form.tools">
            <el-checkbox v-for="tool in availableTools.filter(t => t.name !== 'search_knowledge')" :key="tool.name" :label="tool.name" :value="tool.name"
              style="display: block; margin-bottom: 8px">
              <span>{{ tool.name }}</span>
              <el-tag v-if="httpToolNames.has(tool.name)" size="small" type="warning" style="margin-left: 8px">HTTP</el-tag>
              <el-tag size="small" type="info" style="margin-left: 8px">{{ tool.description?.slice(0, 40) }}</el-tag>
            </el-checkbox>
          </el-checkbox-group>

          <el-divider />

          <h3 style="margin-bottom: 12px">Skills</h3>
          <el-select v-model="form.skills" multiple style="width: 100%" placeholder="Select skills">
            <el-option v-for="skill in availableSkills" :key="skill.name" :label="skill.name" :value="skill.name" />
          </el-select>

          <el-divider />

          <el-button type="primary" @click="handleSave" :loading="saving">Save</el-button>
        </div>
      </el-tab-pane>

      <!-- Tab 3: Knowledge -->
      <el-tab-pane label="Knowledge" name="knowledge" :disabled="!isEdit">
        <div style="max-width: 700px">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
            <h3>Knowledge Base</h3>
            <el-upload
              :show-file-list="false"
              :before-upload="handleKnowledgeFile"
              accept=".txt,.md,.csv,.json,.log,.html,.xml"
            >
              <el-button type="primary" size="small" :loading="knowledgeUploading">Upload File</el-button>
            </el-upload>
          </div>
          <p style="color: #909399; font-size: 13px; margin-bottom: 16px">
            Upload documents so this agent can answer questions based on their content.
          </p>

          <el-table :data="knowledgeSources" size="small" v-loading="knowledgeLoading">
            <el-table-column prop="sourceName" label="Document" min-width="200" />
            <el-table-column prop="chunkCount" label="Chunks" width="100" align="center" />
            <el-table-column label="Actions" width="100" align="center">
              <template #default="{ row }">
                <el-popconfirm title="Delete this document?" @confirm="deleteKnowledge(row.sourceName)">
                  <template #reference>
                    <el-button link type="danger" size="small">Delete</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>

        </div>
      </el-tab-pane>

      <!-- Tab 4: API -->
      <el-tab-pane label="API" name="api" :disabled="!isEdit">
        <div style="max-width: 700px">
          <h3 style="margin-bottom: 16px">Usage Stats</h3>
          <el-row :gutter="16" style="margin-bottom: 24px">
            <el-col :span="12">
              <el-card shadow="never">
                <div class="stat-card">
                  <div class="stat-value">{{ agentUsage.totalRequests }}</div>
                  <div class="stat-label">Total Requests</div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card shadow="never">
                <div class="stat-card">
                  <div class="stat-value">{{ (agentUsage.totalTokensIn + agentUsage.totalTokensOut).toLocaleString() }}</div>
                  <div class="stat-label">Total Tokens</div>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <el-divider />

          <h3 style="margin-bottom: 16px">API Keys</h3>
          <el-table :data="apiKeys" size="small" style="margin-bottom: 16px">
            <el-table-column prop="keyPrefix" label="Key" width="120">
              <template #default="{ row }">
                <code>{{ row.keyPrefix }}...</code>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="Name" />
            <el-table-column prop="lastUsedAt" label="Last Used" width="180">
              <template #default="{ row }">{{ row.lastUsedAt || "Never" }}</template>
            </el-table-column>
            <el-table-column label="" width="80">
              <template #default="{ row }">
                <el-popconfirm title="Revoke this key?" @confirm="revokeKey(row.id)">
                  <template #reference>
                    <el-button link type="danger" size="small">Revoke</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
          <el-button size="small" @click="generateKey">Generate New Key</el-button>

          <div v-if="newlyCreatedKey" style="margin-top: 12px">
            <el-alert type="success" :closable="false" style="margin-bottom: 8px">
              <p>New API key created. Copy it now — it won't be shown again:</p>
              <code style="font-size: 14px; font-weight: bold; display: block; margin-top: 4px">{{ newlyCreatedKey }}</code>
              <el-button size="small" style="margin-top: 8px" @click="copyKey(newlyCreatedKey)">Copy</el-button>
            </el-alert>
          </div>

          <el-divider />

          <h3 style="margin-bottom: 16px">API Documentation</h3>
          <div style="background: #f5f7fa; padding: 16px; border-radius: 4px">

            <h4 style="margin-bottom: 8px">Request Body</h4>
            <el-table :data="apiParamDocs" size="small" border style="margin-bottom: 16px; font-size: 12px">
              <el-table-column prop="field" label="Field" width="120" />
              <el-table-column prop="type" label="Type" width="120" />
              <el-table-column prop="required" label="Required" width="60" align="center" />
              <el-table-column prop="desc" label="Description" />
            </el-table>

            <h4 style="margin-bottom: 6px; margin-top: 4px">images field structure</h4>
            <el-text type="info" size="small" style="display: block; margin-bottom: 8px">
              images is an array, each element is one of two formats:
            </el-text>
            <el-table :data="imageParamDocs" size="small" border style="margin-bottom: 16px; font-size: 12px">
              <el-table-column prop="format" label="Format" width="100" />
              <el-table-column prop="field" label="Field" width="120" />
              <el-table-column prop="type" label="Type" width="80" />
              <el-table-column prop="desc" label="Description" />
            </el-table>

            <el-divider />

            <h4 style="margin-bottom: 8px">Chat (non-streaming) — Text only</h4>
            <pre style="font-size: 12px; white-space: pre-wrap; margin: 0">POST {{ baseUrl }}/api/chat

curl -X POST {{ baseUrl }}/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"message": "Hello", "sessionId": "optional-session-id"}'</pre>

            <el-divider />

            <h4 style="margin-bottom: 8px">Chat (non-streaming) — With image (base64)</h4>
            <pre style="font-size: 12px; white-space: pre-wrap; margin: 0">POST {{ baseUrl }}/api/chat

curl -X POST {{ baseUrl }}/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
  "message": "Describe this image",
  "images": [
    {
      "type": "base64",
      "mediaType": "image/jpeg",
      "data": "/9j/4AAQSkZJRgAB..."
    }
  ]
}'</pre>

            <el-divider />

            <h4 style="margin-bottom: 8px">Chat (non-streaming) — With image (URL)</h4>
            <pre style="font-size: 12px; white-space: pre-wrap; margin: 0">POST {{ baseUrl }}/api/chat

curl -X POST {{ baseUrl }}/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
  "message": "Describe this image",
  "images": [
    {
      "type": "url",
      "url": "https://example.com/image.jpg"
    }
  ]
}'</pre>

            <el-divider />

            <h4 style="margin-bottom: 8px">Chat (streaming)</h4>
            <pre style="font-size: 12px; white-space: pre-wrap; margin: 0">POST {{ baseUrl }}/api/chat/stream

curl -X POST {{ baseUrl }}/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"message": "Hello"}'</pre>

            <el-divider />

            <h4 style="margin-bottom: 8px">Streaming response events (SSE)</h4>
            <el-table :data="sseEventDocs" size="small" border style="font-size: 12px">
              <el-table-column prop="event" label="event.type" width="140" />
              <el-table-column prop="data" label="event.data structure" width="220" />
              <el-table-column prop="desc" label="Description" />
            </el-table>
          </div>
        </div>
      </el-tab-pane>

      <!-- Tab 4: Test Chat -->
      <el-tab-pane label="Test Chat" name="chat" :disabled="!isEdit">
        <div>
          <div>
            <div class="chat-box" ref="chatBoxRef">
              <div v-for="(msg, i) in chatMessages" :key="i" :class="['chat-msg', `chat-msg-${msg.role}`]">
                <div class="chat-msg-role">{{ msg.role === 'user' ? 'You' : 'Agent' }}</div>
                <!-- Thinking collapse -->
                <div v-if="msg.thinking" class="chat-msg-thinking">
                  <div class="chat-msg-thinking-header" @click="toggleThinking(i)">
                    <el-icon style="margin-right: 4px"><CaretRight v-if="!msg.thinkingExpanded" /><CaretBottom v-else /></el-icon>
                    <span>Thinking</span>
                  </div>
                  <div v-if="msg.thinkingExpanded" class="chat-msg-thinking-body">{{ msg.thinking }}</div>
                </div>
                <!-- User message images -->
                <div v-if="msg.images?.length" style="margin-bottom: 6px; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end">
                  <img v-for="(img, ii) in msg.images" :key="ii" :src="img" style="max-width: 180px; max-height: 180px; border-radius: 6px; object-fit: cover; border: 1px solid #e4e7ed" />
                </div>
                <div class="chat-msg-text" style="white-space: pre-wrap">{{ msg.text }}</div>
                <div v-if="msg.toolCalls?.length" class="chat-msg-tools">
                  <el-tag v-for="tc in msg.toolCalls" :key="tc.name" size="small" type="warning" style="margin-right: 4px">
                    {{ tc.name }}
                  </el-tag>
                </div>
                <div v-if="msg.usage" style="font-size: 11px; color: #c0c4cc; margin-top: 4px">
                  {{ (msg.usage.tokensIn + msg.usage.tokensOut).toLocaleString() }} tokens
                  ({{ msg.usage.tokensIn.toLocaleString() }}↑ {{ msg.usage.tokensOut.toLocaleString() }}↓)
                  · {{ (msg.usage.durationMs / 1000).toFixed(1) }}s
                </div>
              </div>
              <div v-if="chatLoading" class="chat-msg chat-msg-assistant">
                <div class="chat-msg-role">Agent</div>
                <div class="chat-msg-text" style="color: #909399">Thinking...</div>
              </div>
            </div>
            <!-- Image preview area -->
            <div v-if="pendingImages.length" style="display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 0; border-top: 1px solid #e4e7ed; margin-top: 4px">
              <div v-for="(img, i) in pendingImages" :key="i" style="position: relative">
                <img :src="img" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #e4e7ed" />
                <el-icon @click="removePendingImage(i)" style="position: absolute; top: -6px; right: -6px; cursor: pointer; background: #fff; border-radius: 50%; color: #f56c6c; font-size: 16px"><CircleClose /></el-icon>
              </div>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 8px; align-items: flex-end">
              <el-upload :show-file-list="false" :before-upload="handleChatImage" accept="image/*" style="flex-shrink: 0">
                <el-button :icon="Picture" circle />
              </el-upload>
              <el-input v-model="chatInput" placeholder="Type a message..." @keyup.enter="sendChat" :disabled="chatLoading" style="flex: 1" />
              <el-button type="primary" @click="sendChat" :loading="chatLoading">Send</el-button>
              <el-button @click="newChat" size="small">New Chat</el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getAgent, createAgent, updateAgent,
  getTools, getSkills, getStats,
  getHttpTools, getProviders,
  createApiKey, deleteApiKey,
  testChat, getAgentStats,
  getKnowledgeSources, uploadKnowledgeApi, deleteKnowledgeApi,
  getSessionMessages,
} from "@/api";
import { ElMessage, ElMessageBox } from "element-plus";
import { Picture, CaretRight, CaretBottom, CircleClose } from "@element-plus/icons-vue";

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => !!route.params.id);
const agentId = computed(() => route.params.id as string);
const loading = ref(false);
const saving = ref(false);
const activeTab = ref("basic");

const form = ref({
  name: "",
  description: "",
  systemPrompt: "",
  providerId: "" as string,
  model: "",
  temperature: 0.7,
  maxTokens: 4096,
  maxIterations: 15,
  streaming: false,
  tools: [] as string[],
  skills: [] as string[],
});

const availableTools = ref<Array<{ name: string; description: string }>>([]);
const httpToolNames = ref<Set<string>>(new Set());
const availableSkills = ref<Array<{ name: string }>>([]);
const availableProviders = ref<Array<{ id: string; name: string; defaultModel: string; isPrimary: boolean }>>([]);

const selectedProviderModel = computed(() => {
  if (!form.value.providerId) {
    const primary = availableProviders.value.find(p => p.isPrimary);
    return primary?.defaultModel ?? "";
  }
  return availableProviders.value.find(p => p.id === form.value.providerId)?.defaultModel ?? "";
});

function onProviderChange() {
  // When provider changes, set model to provider's default
  const provider = availableProviders.value.find(p => p.id === form.value.providerId);
  if (provider) form.value.model = provider.defaultModel;
}

// API tab state
const apiKeys = ref<Array<{ id: string; keyPrefix: string; name: string; lastUsedAt: string | null }>>([]);
const newlyCreatedKey = ref("");
const agentUsage = ref({ totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0 });
const baseUrl = ref(window.location.origin);

// API doc data
const apiParamDocs = [
  { field: "message", type: "string", required: "No*", desc: "User message text. At least one of message or images is required" },
  { field: "sessionId", type: "string", required: "No", desc: "Session ID for multi-turn context. Creates new session if omitted" },
  { field: "images", type: "array", required: "No*", desc: "Image array, supports base64 inline or URL formats. At least one of message or images is required" },
];

const imageParamDocs = [
  { format: "base64", field: "type", type: "string", desc: 'Fixed value "base64"' },
  { format: "base64", field: "mediaType", type: "string", desc: 'Image MIME type, e.g. "image/jpeg", "image/png", "image/webp", "image/gif"' },
  { format: "base64", field: "data", type: "string", desc: "Base64 encoded image string (without data:xxx;base64, prefix)" },
  { format: "url", field: "type", type: "string", desc: 'Fixed value "url"' },
  { format: "url", field: "url", type: "string", desc: "Full HTTP/HTTPS URL of the image, must be accessible by the model" },
];

const sseEventDocs = [
  { event: "thinking", data: "string", desc: "AI thinking process text fragment (streaming, only for thinking-enabled models)" },
  { event: "text", data: "string", desc: "AI reply text fragment (streaming)" },
  { event: "tool_call", data: '{ name: string, input: object }', desc: "Triggered when agent calls a tool" },
  { event: "tool_result", data: '{ name: string, result: string }', desc: "Triggered after tool execution completes" },
  { event: "done", data: '{ reply, sessionId, usage }', desc: "Stream ended, contains full reply, session ID and token usage" },
];

// Test chat state
interface ChatMessage {
  role: string;
  text: string;
  thinking?: string;
  thinkingExpanded?: boolean;
  images?: string[];
  toolCalls?: Array<{ name: string }>;
  usage?: { tokensIn: number; tokensOut: number; durationMs: number };
}
const chatMessages = ref<ChatMessage[]>([]);
const chatInput = ref("");
const chatLoading = ref(false);
const chatSessionId = ref("");
const chatBoxRef = ref<HTMLElement>();
const pendingImages = ref<string[]>([]);

function toggleThinking(index: number) {
  const msg = chatMessages.value[index];
  if (msg) msg.thinkingExpanded = !msg.thinkingExpanded;
}

function newChat() {
  chatMessages.value = [];
  chatSessionId.value = "";
  chatInput.value = "";
  pendingImages.value = [];
  if (agentId.value) {
    localStorage.removeItem('test-chat-session-' + agentId.value);
  }
}

async function loadChatHistory() {
  if (!agentId.value) return;
  const savedSessionId = localStorage.getItem('test-chat-session-' + agentId.value);
  if (!savedSessionId) return;
  chatSessionId.value = savedSessionId;
  try {
    const { data } = await getSessionMessages(savedSessionId);
    chatMessages.value = (data as Array<{ role: string; content: string | unknown[] }>).map((m) => {
      const blocks = typeof m.content === 'string' ? tryParseBlocks(m.content) : m.content as Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
      if (m.role === 'user') {
        const text = typeof m.content === 'string' && !Array.isArray(blocks)
          ? m.content
          : (blocks as Array<{ type: string; text?: string }>).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
        return { role: 'user', text } as ChatMessage;
      }
      // assistant
      const textParts: string[] = [];
      const thinkingParts: string[] = [];
      const toolCalls: Array<{ name: string }> = [];
      if (typeof m.content === 'string' && !Array.isArray(blocks)) {
        textParts.push(m.content);
      } else {
        for (const b of blocks as Array<{ type: string; text?: string; name?: string }>) {
          if (b.type === 'thinking' && b.text) thinkingParts.push(b.text);
          else if (b.type === 'text' && b.text) textParts.push(b.text);
          else if (b.type === 'tool_use' && b.name) toolCalls.push({ name: b.name });
        }
      }
      return {
        role: 'assistant',
        text: textParts.join(''),
        thinking: thinkingParts.join('') || undefined,
        thinkingExpanded: false,
        toolCalls: toolCalls.length ? toolCalls : undefined,
      } as ChatMessage;
    });
  } catch {
    // session may no longer exist, clear stale reference
    chatSessionId.value = '';
    localStorage.removeItem('test-chat-session-' + agentId.value);
  }
}

function tryParseBlocks(s: string): string | Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }> {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : s;
  } catch {
    return s;
  }
}

function removePendingImage(index: number) {
  pendingImages.value.splice(index, 1);
}

function handleChatImage(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    pendingImages.value.push(reader.result as string);
  };
  reader.readAsDataURL(file);
  return false;
}

// Knowledge state
const knowledgeSources = ref<Array<{ sourceName: string; chunkCount: number }>>([]);
const knowledgeLoading = ref(false);
const knowledgeUploading = ref(false);

async function loadKnowledge() {
  if (!isEdit.value) return;
  knowledgeLoading.value = true;
  try {
    const { data } = await getKnowledgeSources(agentId.value);
    knowledgeSources.value = data;
  } catch { /* ignore */ }
  finally { knowledgeLoading.value = false; }
}

function handleKnowledgeFile(file: File) {
  const reader = new FileReader();
  reader.onload = async () => {
    const content = reader.result as string;
    if (!content.trim()) { ElMessage.warning("File is empty"); return; }
    const name = file.name.replace(/\.[^.]+$/, "");
    knowledgeUploading.value = true;
    try {
      const { data } = await uploadKnowledgeApi(agentId.value, { name, content });
      ElMessage.success(`${file.name} uploaded: ${data.chunks} chunks`);
      loadKnowledge();
    } catch {
      ElMessage.error("Failed to upload");
    } finally { knowledgeUploading.value = false; }
  };
  reader.readAsText(file);
  return false; // prevent default upload
}

async function deleteKnowledge(sourceName: string) {
  try {
    await deleteKnowledgeApi(agentId.value, sourceName);
    ElMessage.success("Deleted");
    loadKnowledge();
  } catch {
    ElMessage.error("Failed to delete");
  }
}


async function loadData() {
  loading.value = true;
  try {
    const [toolsRes, skillsRes, statsRes, httpToolsRes, providersRes] = await Promise.all([
      getTools().catch(() => ({ data: [] })),
      getSkills().catch(() => ({ data: [] })),
      getStats().catch(() => ({ data: {} })),
      getHttpTools().catch(() => ({ data: [] })),
      getProviders().catch(() => ({ data: [] })),
    ]);
    availableTools.value = toolsRes.data;
    availableSkills.value = skillsRes.data;
    httpToolNames.value = new Set((httpToolsRes.data as Array<{ name: string }>).map(t => t.name));
    availableProviders.value = providersRes.data;

    if (!isEdit.value) {
      // Auto-select primary provider and its default model for new agents
      const primary = availableProviders.value.find(p => p.isPrimary) ?? availableProviders.value[0];
      if (primary) {
        form.value.providerId = primary.id;
        form.value.model = primary.defaultModel;
      }
    }

    if (isEdit.value) {
      const { data } = await getAgent(agentId.value);
      apiKeys.value = data.apiKeys || [];
      Object.assign(form.value, {
        name: data.name,
        description: data.description,
        systemPrompt: data.systemPrompt,
        providerId: data.providerId ?? "",
        model: data.model,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        maxIterations: data.maxIterations,
        streaming: data.streaming,
        tools: data.tools,
        skills: data.skills,
      });

      loadKnowledge();

      // Load agent usage stats
      try {
        const { data: usageData } = await getAgentStats(agentId.value);
        agentUsage.value = usageData;
      } catch {
        // ok if no stats
      }
    }
  } catch {
    ElMessage.error("Failed to load data");
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  if (!form.value.name || !form.value.systemPrompt) {
    ElMessage.warning("Name and System Prompt are required");
    return;
  }
  saving.value = true;
  try {
    if (isEdit.value) {
      await updateAgent(agentId.value, form.value);
      ElMessage.success("Agent updated");
    } else {
      const { data } = await createAgent(form.value);
      ElMessage.success("Agent created");
      // Show the raw key immediately
      if (data.apiKeys?.[0]?.rawKey) {
        newlyCreatedKey.value = data.apiKeys[0].rawKey;
      }
      router.replace(`/agents/${data.id}/edit`);
    }
  } catch {
    ElMessage.error("Failed to save agent");
  } finally {
    saving.value = false;
  }
}

async function generateKey() {
  try {
    const { value: keyName } = await ElMessageBox.prompt("Give this key a name (for your reference)", "New API Key", {
      inputValue: "",
      inputPlaceholder: "e.g. production, dev-test, mobile-app",
      confirmButtonText: "Generate",
      cancelButtonText: "Cancel",
    });
    const name = keyName?.trim() || "default";
    const { data } = await createApiKey(agentId.value, name);
    newlyCreatedKey.value = data.rawKey;
    apiKeys.value.unshift(data);
    ElMessage.success("API key generated");
  } catch {
    // user cancelled or error
  }
}

async function revokeKey(keyId: string) {
  try {
    await deleteApiKey(agentId.value, keyId);
    apiKeys.value = apiKeys.value.filter((k) => k.id !== keyId);
    ElMessage.success("Key revoked");
  } catch {
    ElMessage.error("Failed to revoke key");
  }
}

function copyKey(key: string) {
  navigator.clipboard.writeText(key);
  ElMessage.success("Copied to clipboard");
}

/** Convert base64 dataURL to {type, data, mediaType} for backend */
function parseImageDataUrl(dataUrl: string): { data: string; mediaType: string } | null {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

async function sendChat() {
  const msg = chatInput.value.trim();
  const images = [...pendingImages.value];
  if (!msg && !images.length) return;

  chatMessages.value.push({ role: "user", text: msg, images: images.length ? [...images] : undefined });
  chatInput.value = "";
  pendingImages.value = [];
  chatLoading.value = true;

  await nextTick();
  if (chatBoxRef.value) chatBoxRef.value.scrollTop = chatBoxRef.value.scrollHeight;

  if (form.value.streaming) {
    await sendChatStream(msg, images);
  } else {
    await sendChatNonStream(msg, images);
  }

  chatLoading.value = false;
  await nextTick();
  if (chatBoxRef.value) chatBoxRef.value.scrollTop = chatBoxRef.value.scrollHeight;
}

async function sendChatNonStream(msg: string, images: string[]) {
  try {
    const imageBlocks = images.map(img => {
      const parsed = parseImageDataUrl(img);
      return parsed ? { type: "base64" as const, ...parsed } : null;
    }).filter(Boolean);

    const { data } = await testChat(agentId.value, msg, chatSessionId.value || undefined, imageBlocks.length ? imageBlocks as Array<{ type: "base64"; data: string; mediaType: string }> : undefined);
    chatSessionId.value = data.sessionId;
    if (agentId.value && data.sessionId) {
      localStorage.setItem('test-chat-session-' + agentId.value, data.sessionId);
    }
    chatMessages.value.push({
      role: "assistant",
      text: data.reply,
      toolCalls: data.toolCalls,
      usage: data.usage,
    });
  } catch (e: unknown) {
    const errMsg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || "Request failed";
    chatMessages.value.push({ role: "assistant", text: `Error: ${errMsg}` });
  }
}

async function sendChatStream(msg: string, images: string[]) {
  try {
    const imageBlocks = images.map(img => {
      const parsed = parseImageDataUrl(img);
      return parsed ? { type: "base64" as const, ...parsed } : null;
    }).filter(Boolean);

    const response = await fetch(`/api/agents/${agentId.value}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": localStorage.getItem("adminSecret") || "",
      },
      body: JSON.stringify({
        message: msg,
        sessionId: chatSessionId.value || undefined,
        images: imageBlocks.length ? imageBlocks : undefined,
      }),
    });

    if (!response.ok) {
      chatMessages.value.push({ role: "assistant", text: `Error: HTTP ${response.status}` });
      return;
    }

    // Add empty assistant message for streaming
    const assistantMsg: ChatMessage = { role: "assistant", text: "", thinking: "", thinkingExpanded: false, toolCalls: [] };
    chatMessages.value.push(assistantMsg);
    const msgIndex = chatMessages.value.length - 1;

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") continue;

        try {
          const event = JSON.parse(payload);
          if (event.type === "thinking") {
            chatMessages.value[msgIndex].thinking = (chatMessages.value[msgIndex].thinking ?? "") + event.data;
          } else if (event.type === "text") {
            chatMessages.value[msgIndex].text += event.data;
          } else if (event.type === "tool_call") {
            chatMessages.value[msgIndex].toolCalls!.push({ name: event.data.name });
          } else if (event.type === "done") {
            chatSessionId.value = event.data.sessionId;
            if (agentId.value && event.data.sessionId) {
              localStorage.setItem('test-chat-session-' + agentId.value, event.data.sessionId);
            }
            // Collapse thinking content by default
            if (chatMessages.value[msgIndex].thinking) {
              chatMessages.value[msgIndex].thinkingExpanded = false;
            }
          }
        } catch {
          // skip malformed lines
        }
      }

      await nextTick();
      if (chatBoxRef.value) chatBoxRef.value.scrollTop = chatBoxRef.value.scrollHeight;
    }
  } catch (e: unknown) {
    chatMessages.value.push({ role: "assistant", text: `Error: ${(e as Error).message}` });
  }
}

onMounted(() => {
  loadData();
  loadChatHistory();
});
</script>

<style scoped>
.chat-box {
  height: calc(100vh - 300px);
  min-height: 400px;
  overflow-y: auto;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 12px;
  background: #fafafa;
}
.chat-msg {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  max-width: 85%;
}
.chat-msg-user {
  background: #ecf5ff;
  margin-left: auto;
  text-align: right;
}
.chat-msg-assistant {
  background: #f0f9eb;
}
.chat-msg-role {
  font-size: 11px;
  color: #909399;
  margin-bottom: 2px;
}
.chat-msg-text {
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
}
.chat-msg-tools {
  margin-top: 4px;
}
.chat-msg-thinking {
  margin-bottom: 6px;
  border: 1px solid #e6a23c;
  border-radius: 6px;
  overflow: hidden;
  font-size: 12px;
}
.chat-msg-thinking-header {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: #fdf6ec;
  color: #e6a23c;
  cursor: pointer;
  user-select: none;
  font-weight: 500;
}
.chat-msg-thinking-header:hover {
  background: #faecd8;
}
.chat-msg-thinking-body {
  padding: 8px;
  background: #fff;
  color: #606266;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
  line-height: 1.6;
}
</style>
