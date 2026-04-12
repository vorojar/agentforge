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

          <el-form-item label="Model" required>
            <el-select v-model="form.providerId" style="width: 100%" placeholder="Select a model"
              @change="onProviderChange">
              <el-option v-for="p in availableProviders" :key="p.id" :label="p.name" :value="p.id">
                <span>{{ p.name }}</span>
                <el-tag v-if="p.isPrimary" type="success" size="small" style="margin-left: 8px">Primary</el-tag>
              </el-option>
            </el-select>
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

          <el-form-item label="Extended Thinking">
            <el-switch v-model="form.thinking" />
            <el-text type="info" size="small" style="margin-left: 8px">启用后可查看 AI 的思考过程（Claude 等模型支持）</el-text>
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
            <el-checkbox v-for="tool in availableTools.filter(t => t.name !== 'search_knowledge' && t.name !== 'get_skill_content')" :key="tool.name" :label="tool.name" :value="tool.name"
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
        <div style="max-width: 900px">
          <h3 style="margin-bottom: 8px">Associated Knowledge Bases</h3>
          <p style="color: #909399; font-size: 13px; margin-bottom: 16px">
            Select knowledge bases for this agent. Manage knowledge bases in the
            <router-link to="/knowledge-bases" style="color: #409eff">Knowledge Base Management</router-link> page.
          </p>

          <el-select
            v-model="selectedKbIds"
            multiple
            style="width: 100%; margin-bottom: 16px"
            placeholder="Select knowledge bases..."
            @change="handleKbChange"
            v-loading="knowledgeLoading"
          >
            <el-option
              v-for="kb in allKnowledgeBases"
              :key="kb.id"
              :label="kb.name"
              :value="kb.id"
            >
              <span>{{ kb.name }}</span>
              <span style="color: #909399; font-size: 12px; margin-left: 8px">
                {{ kb.description || '' }}
              </span>
            </el-option>
          </el-select>

          <el-table v-if="selectedKbDetails.length > 0" :data="selectedKbDetails" size="small">
            <el-table-column prop="name" label="Knowledge Base" min-width="160" />
            <el-table-column prop="description" label="Description" min-width="200">
              <template #default="{ row }">{{ row.description || '-' }}</template>
            </el-table-column>
            <el-table-column label="Sources" width="80" align="center">
              <template #default="{ row }">{{ row.sources?.length ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="" width="100" align="center">
              <template #default="{ row }">
                <el-button link size="small" @click="$router.push('/knowledge-bases')">Manage</el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-empty v-else-if="!knowledgeLoading" description="No knowledge bases associated" />
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
              <el-table-column prop="field" label="字段" width="120" />
              <el-table-column prop="type" label="类型" width="120" />
              <el-table-column prop="required" label="必填" width="60" align="center" />
              <el-table-column prop="desc" label="说明" />
            </el-table>

            <h4 style="margin-bottom: 6px; margin-top: 4px">images 字段结构</h4>
            <el-text type="info" size="small" style="display: block; margin-bottom: 8px">
              images 是数组，每个元素为以下两种格式之一：
            </el-text>
            <el-table :data="imageParamDocs" size="small" border style="margin-bottom: 16px; font-size: 12px">
              <el-table-column prop="format" label="格式" width="100" />
              <el-table-column prop="field" label="字段" width="120" />
              <el-table-column prop="type" label="类型" width="80" />
              <el-table-column prop="desc" label="说明" />
            </el-table>

            <el-divider />

            <h4 style="margin-bottom: 8px">Chat (non-streaming) — 纯文本</h4>
            <pre style="font-size: 12px; white-space: pre-wrap; margin: 0">POST {{ baseUrl }}/api/chat

curl -X POST {{ baseUrl }}/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"message": "Hello", "sessionId": "optional-session-id"}'</pre>

            <el-divider />

            <h4 style="margin-bottom: 8px">Chat (non-streaming) — 携带图片（base64）</h4>
            <pre style="font-size: 12px; white-space: pre-wrap; margin: 0">POST {{ baseUrl }}/api/chat

curl -X POST {{ baseUrl }}/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
  "message": "请描述这张图片",
  "images": [
    {
      "type": "base64",
      "mediaType": "image/jpeg",
      "data": "/9j/4AAQSkZJRgAB..."
    }
  ]
}'</pre>

            <el-divider />

            <h4 style="margin-bottom: 8px">Chat (non-streaming) — 携带图片（URL）</h4>
            <pre style="font-size: 12px; white-space: pre-wrap; margin: 0">POST {{ baseUrl }}/api/chat

curl -X POST {{ baseUrl }}/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
  "message": "请描述这张图片",
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

            <h4 style="margin-bottom: 8px">Streaming 响应事件格式（SSE）</h4>
            <el-table :data="sseEventDocs" size="small" border style="font-size: 12px">
              <el-table-column prop="event" label="event.type" width="140" />
              <el-table-column prop="data" label="event.data 结构" width="220" />
              <el-table-column prop="desc" label="说明" />
            </el-table>
          </div>
        </div>
      </el-tab-pane>

      <!-- Tab 4: Test Chat -->
      <el-tab-pane label="Test Chat" name="chat" :disabled="!isEdit">
        <div class="chat-container">
          <div class="chat-box" ref="chatBoxRef">
            <div v-for="(msg, i) in chatMessages" :key="i" :class="['chat-msg', msg.isSystemPrompt ? 'chat-msg-system' : `chat-msg-${msg.role}`]">
              <!-- System Prompt 折叠展示 -->
              <template v-if="msg.isSystemPrompt">
                <div class="chat-msg-system-header" @click="toggleSystemPrompt(i)">
                  <el-icon style="margin-right: 4px"><CaretRight v-if="!msg.systemPromptExpanded" /><CaretBottom v-else /></el-icon>
                  <el-tag size="small" type="info">System Prompt</el-tag>
                  <span style="margin-left: 6px; color: #909399; font-size: 12px">{{ msg.text.length.toLocaleString() }} chars</span>
                </div>
                <div v-if="msg.systemPromptExpanded" class="chat-msg-system-body">{{ msg.text }}</div>
              </template>
              <template v-else>
                <div class="chat-msg-role">{{ msg.role === 'user' ? 'You' : 'Agent' }}</div>
                <!-- 思考过程折叠展示 -->
                <div v-if="msg.thinking" class="chat-msg-thinking">
                  <div class="chat-msg-thinking-header" @click="toggleThinking(i)">
                    <el-icon style="margin-right: 4px"><CaretRight v-if="!msg.thinkingExpanded" /><CaretBottom v-else /></el-icon>
                    <span>思考过程</span>
                  </div>
                  <div v-if="msg.thinkingExpanded" class="chat-msg-thinking-body">{{ msg.thinking }}</div>
                </div>
                <!-- 用户消息展示图片 -->
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
                  <span v-if="msg.usage.cacheReadTokens" style="color: #67c23a"> · {{ msg.usage.cacheReadTokens.toLocaleString() }} cache</span>
                  · {{ (msg.usage.durationMs / 1000).toFixed(1) }}s
                </div>
              </template>
            </div>
            <div v-if="chatLoading" class="chat-msg chat-msg-assistant">
              <div class="chat-msg-role">Agent</div>
              <div class="chat-msg-text" style="color: #909399">Thinking...</div>
            </div>
          </div>
          <div class="chat-toolbar">
            <!-- 图片预览区 -->
            <div v-if="pendingImages.length" class="chat-pending-images">
              <div v-for="(img, i) in pendingImages" :key="i" style="position: relative">
                <img :src="img" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #e4e7ed" />
                <el-icon @click="removePendingImage(i)" style="position: absolute; top: -6px; right: -6px; cursor: pointer; background: #fff; border-radius: 50%; color: #f56c6c; font-size: 16px"><CircleClose /></el-icon>
              </div>
            </div>
            <div class="chat-input-row">
              <el-upload :show-file-list="false" :before-upload="handleChatImage" accept="image/*" style="flex-shrink: 0">
                <el-button :icon="Picture" circle />
              </el-upload>
              <el-input v-model="chatInput" placeholder="Type a message..." @keyup.enter="sendChat" :disabled="chatLoading" style="flex: 1" />
              <el-button type="primary" @click="sendChat" :loading="chatLoading">Send</el-button>
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
  getKnowledgeBases, getAgentKnowledge, setAgentKnowledge,
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
  thinking: false,
  tools: [] as string[],
  skills: [] as string[],
});

const availableTools = ref<Array<{ name: string; description: string }>>([]);
const httpToolNames = ref<Set<string>>(new Set());
const availableSkills = ref<Array<{ name: string }>>([]);
const availableProviders = ref<Array<{ id: string; name: string; defaultModel: string; isPrimary: boolean }>>([]);

function onProviderChange() {
  const provider = availableProviders.value.find(p => p.id === form.value.providerId);
  if (provider) form.value.model = provider.defaultModel;
}

// API tab state
const apiKeys = ref<Array<{ id: string; keyPrefix: string; name: string; lastUsedAt: string | null }>>([]);
const newlyCreatedKey = ref("");
const agentUsage = ref({ totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0 });
const baseUrl = ref(window.location.origin);

// API 文档数据
const apiParamDocs = [
  { field: "message", type: "string", required: "否*", desc: "用户消息文本。message 和 images 至少提供一个" },
  { field: "sessionId", type: "string", required: "否", desc: "会话 ID，用于保持多轮对话上下文。不传则创建新会话" },
  { field: "images", type: "array", required: "否*", desc: "图片数组，支持 base64 内联或 URL 两种格式。message 和 images 至少提供一个" },
];

const imageParamDocs = [
  { format: "base64", field: "type", type: "string", desc: '固定值 "base64"' },
  { format: "base64", field: "mediaType", type: "string", desc: '图片 MIME 类型，如 "image/jpeg"、"image/png"、"image/webp"、"image/gif"' },
  { format: "base64", field: "data", type: "string", desc: "图片的 base64 编码字符串（不含 data:xxx;base64, 前缀）" },
  { format: "url", field: "type", type: "string", desc: '固定值 "url"' },
  { format: "url", field: "url", type: "string", desc: "图片的完整 HTTP/HTTPS URL，需确保模型可访问" },
];

const sseEventDocs = [
  { event: "thinking", data: "string", desc: "AI 思考过程文本片段（流式累积，仅支持思考模式的模型）" },
  { event: "text", data: "string", desc: "AI 回复正文文本片段（流式累积）" },
  { event: "tool_call", data: '{ name: string, input: object }', desc: "Agent 调用工具时触发" },
  { event: "tool_result", data: '{ name: string, result: string }', desc: "工具执行完成后触发" },
  { event: "done", data: '{ reply, sessionId, usage }', desc: "流式输出结束，包含完整回复、会话 ID 和 token 用量" },
];

// Test chat state
interface ChatMessage {
  role: string;
  text: string;
  thinking?: string;
  thinkingExpanded?: boolean;
  images?: string[];
  toolCalls?: Array<{ name: string }>;
  usage?: { tokensIn: number; tokensOut: number; cacheReadTokens?: number; durationMs: number };
  isSystemPrompt?: boolean;
  systemPromptExpanded?: boolean;
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

function toggleSystemPrompt(index: number) {
  const msg = chatMessages.value[index];
  if (msg) msg.systemPromptExpanded = !msg.systemPromptExpanded;
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

// Knowledge association state
interface KnowledgeBaseItem {
  id: string;
  name: string;
  description: string;
  sources?: Array<{ sourceName: string; chunkCount: number }>;
}
const allKnowledgeBases = ref<KnowledgeBaseItem[]>([]);
const selectedKbIds = ref<string[]>([]);
const knowledgeLoading = ref(false);

const selectedKbDetails = computed(() => {
  return allKnowledgeBases.value.filter(kb => selectedKbIds.value.includes(kb.id));
});

async function loadKnowledge() {
  if (!isEdit.value) return;
  knowledgeLoading.value = true;
  try {
    const [kbsRes, agentKbRes] = await Promise.all([
      getKnowledgeBases(),
      getAgentKnowledge(agentId.value),
    ]);
    allKnowledgeBases.value = kbsRes.data;
    selectedKbIds.value = agentKbRes.data.kbIds || [];
  } catch { /* ignore */ }
  finally { knowledgeLoading.value = false; }
}

async function handleKbChange(newIds: string[]) {
  try {
    await setAgentKnowledge(agentId.value, newIds);
    ElMessage.success("Knowledge bases updated");
  } catch {
    ElMessage.error("Failed to update");
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
        thinking: data.thinking ?? false,
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

/** 将 base64 dataURL 转换为 {type, data, mediaType} 格式供后端使用 */
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
    if (data.systemPrompt && chatMessages.value.filter(m => !m.isSystemPrompt).length <= 2) {
      chatMessages.value.splice(chatMessages.value.length - 1, 0, {
        role: "system", text: data.systemPrompt, isSystemPrompt: true, systemPromptExpanded: false,
      });
    }
    chatMessages.value.push({
      role: "assistant",
      text: data.reply,
      thinking: data.thinking || "",
      thinkingExpanded: false,
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

    // 添加一条空的 assistant 消息，流式填充
    const assistantMsg: ChatMessage = { role: "assistant", text: "", thinking: "", thinkingExpanded: false, toolCalls: [] };
    chatMessages.value.push(assistantMsg);
    let msgIndex = chatMessages.value.length - 1;

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
          if (event.type === "system_prompt") {
            const nonSystemCount = chatMessages.value.filter(m => !m.isSystemPrompt).length;
            if (nonSystemCount <= 2) {
              chatMessages.value.splice(msgIndex, 0, {
                role: "system", text: event.data, isSystemPrompt: true, systemPromptExpanded: false,
              });
              msgIndex++;
            }
          } else if (event.type === "thinking") {
            chatMessages.value[msgIndex].thinking = (chatMessages.value[msgIndex].thinking ?? "") + event.data;
          } else if (event.type === "text") {
            chatMessages.value[msgIndex].text += event.data;
          } else if (event.type === "tool_call") {
            chatMessages.value[msgIndex].toolCalls!.push({ name: event.data.name });
          } else if (event.type === "done") {
            chatSessionId.value = event.data.sessionId;
            if (event.data.usage) {
              chatMessages.value[msgIndex].usage = event.data.usage;
            }
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

onMounted(loadData);
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 200px);
  min-height: 400px;
}
.chat-box {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #e4e7ed;
  border-radius: 4px 4px 0 0;
  padding: 12px;
  background: #fafafa;
}
.chat-toolbar {
  flex-shrink: 0;
  border: 1px solid #e4e7ed;
  border-top: none;
  border-radius: 0 0 4px 4px;
  padding: 8px 12px;
  background: #fff;
}
.chat-pending-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e4e7ed;
  margin-bottom: 8px;
}
.chat-input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
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
.chat-msg-system {
  background: #f4f4f5;
  border: 1px dashed #c0c4cc;
  max-width: 100%;
}
.chat-msg-system-header {
  display: flex;
  align-items: center;
  padding: 2px 0;
  cursor: pointer;
  user-select: none;
}
.chat-msg-system-header:hover {
  opacity: 0.8;
}
.chat-msg-system-body {
  margin-top: 6px;
  padding: 8px;
  background: #fff;
  border-radius: 4px;
  font-size: 12px;
  color: #606266;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
  line-height: 1.6;
  font-family: "SF Mono", "Fira Code", Consolas, monospace;
}
.knowledge-editor {
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 12px;
  font-family: "SF Mono", "Fira Code", Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  color: #303133;
  background: #fafafa;
}
.knowledge-editor:focus {
  border-color: #409eff;
  background: #fff;
}
</style>
