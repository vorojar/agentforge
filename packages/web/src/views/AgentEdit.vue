<template>
  <div>
    <div class="page-header">
      <h2>{{ isEdit ? form.name || t("agent.titleFallback") : t("agents.createAgent") }}</h2>
      <el-button @click="$router.push('/agents')">{{ t("common.back") }}</el-button>
    </div>

    <el-tabs v-model="activeTab" type="border-card" v-loading="loading">
      <!-- Tab 1: Basic Info -->
      <el-tab-pane :label="t('agent.basicInfo')" name="basic">
        <el-form :model="form" label-width="140px" style="max-width: 700px">
          <el-form-item :label="t('common.name')" required>
            <el-input v-model="form.name" :placeholder="t('agent.agentName')" />
          </el-form-item>

          <el-form-item :label="t('common.description')">
            <el-input v-model="form.description" type="textarea" :rows="2" />
          </el-form-item>

          <el-form-item :label="t('common.category')">
            <el-input v-model="form.category" :placeholder="t('agent.optionalCategory')" />
          </el-form-item>

          <el-form-item :label="t('agent.systemPrompt')" required>
            <el-input v-model="form.systemPrompt" type="textarea" :rows="8"
              :placeholder="t('agent.systemPromptPlaceholder')" />
          </el-form-item>

          <el-form-item :label="t('common.model')" required>
            <el-select v-model="form.providerId" style="width: 100%" :placeholder="t('agent.selectModel')"
              @change="onProviderChange">
              <el-option v-for="p in availableProviders" :key="p.id" :label="p.name" :value="p.id">
                <span>{{ p.name }}</span>
                <el-tag v-if="p.isPrimary" type="success" size="small" style="margin-left: 8px">{{ t("common.primary") }}</el-tag>
              </el-option>
            </el-select>
            <div v-if="selectedProvider" class="model-capabilities">
              <el-tag v-if="selectedProvider.capabilities.supportsTools" size="small">{{ t("cap.tools") }}</el-tag>
              <el-tag v-if="selectedProvider.capabilities.supportsVision" size="small">{{ t("cap.vision") }}</el-tag>
              <el-tag v-if="selectedProvider.capabilities.supportsThinking" size="small">{{ t("cap.thinking") }}</el-tag>
              <el-tag v-if="selectedProvider.capabilities.supportsStreaming" size="small">{{ t("cap.streaming") }}</el-tag>
            </div>
          </el-form-item>

          <el-form-item :label="t('agent.fallbackModels')">
            <div style="width: 100%">
              <div
                v-for="(fallback, index) in form.fallbackModels"
                :key="index"
                style="display: flex; gap: 8px; margin-bottom: 8px"
              >
                <el-select v-model="fallback.providerId" style="flex: 1" :placeholder="t('agent.provider')" @change="onFallbackProviderChange(index)">
                  <el-option v-for="p in availableProviders" :key="p.id" :label="p.name" :value="p.id" />
                </el-select>
                <el-input v-model="fallback.model" style="flex: 1" :placeholder="t('common.model')" />
                <el-button @click="removeFallbackModel(index)">{{ t("agent.remove") }}</el-button>
              </div>
              <el-button size="small" @click="addFallbackModel">{{ t("agent.addFallback") }}</el-button>
            </div>
          </el-form-item>

          <el-form-item :label="t('agent.fallbackCooldown')">
            <el-input-number v-model="form.fallbackCooldownSeconds" :min="0" :max="86400" :step="60" />
            <el-text type="info" size="small" style="margin-left: 8px">{{ t("agent.seconds") }}</el-text>
          </el-form-item>

          <el-form-item :label="t('agent.temperature')">
            <el-slider v-model="form.temperature" :min="0" :max="1" :step="0.1" show-input />
          </el-form-item>

          <el-form-item :label="t('agent.maxTokens')">
            <el-input-number v-model="form.maxTokens" :min="256" :max="32768" :step="256" />
          </el-form-item>

          <el-form-item :label="t('agent.maxIterations')">
            <el-input-number v-model="form.maxIterations" :min="1" :max="50" />
          </el-form-item>

          <el-form-item :label="t('cap.streaming')">
            <el-switch v-model="form.streaming" />
          </el-form-item>

          <el-form-item :label="t('agent.extendedThinking')">
            <el-switch v-model="form.thinking" :disabled="selectedProvider && !selectedProvider.capabilities.supportsThinking" />
            <el-text type="info" size="small" style="margin-left: 8px">{{ t("agent.thinkingHelp") }}</el-text>
            <el-alert
              v-if="selectedProvider && !selectedProvider.capabilities.supportsThinking"
              type="warning"
              :closable="false"
              show-icon
              :title="t('agent.thinkingUnsupported')"
              style="margin-top: 8px"
            />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" @click="handleSave" :loading="saving">{{ t("common.save") }}</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- Tab 2: Tools & Skills -->
      <el-tab-pane :label="t('agent.toolsSkills')" name="tools" :disabled="!isEdit">
        <div style="max-width: 700px">
          <h3 style="margin-bottom: 12px">{{ t("agent.toolWhitelist") }}</h3>
          <p style="color: #909399; font-size: 13px; margin-bottom: 12px">
            {{ t("agent.toolWhitelistHelp") }}
          </p>
          <el-alert
            v-if="selectedProvider && !selectedProvider.capabilities.supportsTools"
            type="warning"
            :closable="false"
            show-icon
            :title="t('agent.toolsUnsupported')"
            style="margin-bottom: 12px"
          />
          <el-checkbox-group v-model="form.tools" :disabled="selectedProvider && !selectedProvider.capabilities.supportsTools">
            <el-checkbox v-for="tool in availableTools.filter(t => t.name !== 'search_knowledge' && t.name !== 'get_skill_content')" :key="tool.name" :label="tool.name" :value="tool.name"
              style="display: block; margin-bottom: 8px">
              <span>{{ tool.name }}</span>
              <el-tag v-if="httpToolNames.has(tool.name)" size="small" type="warning" style="margin-left: 8px">HTTP</el-tag>
              <el-tag size="small" type="info" style="margin-left: 8px">{{ tool.description?.slice(0, 40) }}</el-tag>
            </el-checkbox>
          </el-checkbox-group>

          <el-divider />

          <h3 style="margin-bottom: 12px">{{ t("nav.skills") }}</h3>
          <el-select v-model="form.skills" multiple style="width: 100%" :placeholder="t('agent.selectSkills')">
            <el-option v-for="skill in availableSkills" :key="skill.name" :label="skill.name" :value="skill.name" />
          </el-select>

          <el-divider />

          <el-button type="primary" @click="handleSave" :loading="saving">{{ t("common.save") }}</el-button>
        </div>
      </el-tab-pane>

      <!-- Tab 3: Knowledge -->
      <el-tab-pane :label="t('agent.knowledge')" name="knowledge" :disabled="!isEdit">
        <div style="max-width: 900px">
          <h3 style="margin-bottom: 8px">{{ t("agent.associatedKnowledgeBases") }}</h3>
          <p style="color: #909399; font-size: 13px; margin-bottom: 16px">
            {{ t("agent.knowledgeHelpPrefix") }}
            <router-link to="/knowledge-bases" style="color: #409eff">{{ t("page.knowledgeManagement") }}</router-link>
            {{ t("agent.knowledgeHelpSuffix") }}
          </p>

          <el-select
            v-model="selectedKbIds"
            multiple
            style="width: 100%; margin-bottom: 16px"
            :placeholder="t('agent.selectKnowledgeBases')"
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
            <el-table-column prop="name" :label="t('agent.knowledgeBase')" min-width="160" />
            <el-table-column prop="description" :label="t('common.description')" min-width="200">
              <template #default="{ row }">{{ row.description || '-' }}</template>
            </el-table-column>
            <el-table-column :label="t('agent.sources')" width="80" align="center">
              <template #default="{ row }">{{ row.sources?.length ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="" width="100" align="center">
              <template #default="{ row }">
                <el-button link size="small" @click="$router.push('/knowledge-bases')">{{ t("common.manage") }}</el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-empty v-else-if="!knowledgeLoading" :description="t('agent.noKnowledgeBases')" />
        </div>
      </el-tab-pane>

      <!-- Tab 4: API -->
      <el-tab-pane :label="t('agent.api')" name="api" :disabled="!isEdit">
        <div style="max-width: 700px">
          <h3 style="margin-bottom: 16px">{{ t("agent.usageStats") }}</h3>
          <el-row :gutter="16" style="margin-bottom: 24px">
            <el-col :span="12">
              <el-card shadow="never">
                <div class="stat-card">
                  <div class="stat-value">{{ agentUsage.totalRequests }}</div>
                  <div class="stat-label">{{ t("agent.totalRequests") }}</div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card shadow="never">
                <div class="stat-card">
                  <div class="stat-value">{{ (agentUsage.totalTokensIn + agentUsage.totalTokensOut).toLocaleString() }}</div>
                  <div class="stat-label">{{ t("agent.totalTokens") }}</div>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <el-divider />

          <h3 style="margin-bottom: 16px">{{ t("agent.apiKeys") }}</h3>
          <el-table :data="apiKeys" size="small" style="margin-bottom: 16px">
            <el-table-column prop="keyPrefix" :label="t('common.key')" width="120">
              <template #default="{ row }">
                <code>{{ row.keyPrefix }}...</code>
              </template>
            </el-table-column>
            <el-table-column prop="name" :label="t('common.name')" />
            <el-table-column prop="lastUsedAt" :label="t('agent.lastUsed')" width="180">
              <template #default="{ row }">{{ row.lastUsedAt || t("common.never") }}</template>
            </el-table-column>
            <el-table-column label="" width="80">
              <template #default="{ row }">
                <el-popconfirm :title="t('agent.revokeConfirm')" @confirm="revokeKey(row.id)">
                  <template #reference>
                    <el-button link type="danger" size="small">{{ t("agent.revoke") }}</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
          <el-button size="small" @click="generateKey">{{ t("agent.generateNewKey") }}</el-button>

          <div v-if="newlyCreatedKey" style="margin-top: 12px">
            <el-alert type="success" :closable="false" style="margin-bottom: 8px">
              <p>{{ t("agent.newKeyCreated") }}</p>
              <code style="font-size: 14px; font-weight: bold; display: block; margin-top: 4px">{{ newlyCreatedKey }}</code>
              <el-button size="small" style="margin-top: 8px" @click="copyKey(newlyCreatedKey)">{{ t("common.copy") }}</el-button>
            </el-alert>
          </div>

          <el-divider />

          <h3 style="margin-bottom: 16px">{{ t("agent.apiDocumentation") }}</h3>
          <div style="background: #f5f7fa; padding: 16px; border-radius: 4px">

            <h4 style="margin-bottom: 8px">{{ t("agent.requestBody") }}</h4>
            <el-table :data="apiParamDocs" size="small" border style="margin-bottom: 16px; font-size: 12px">
              <el-table-column prop="field" :label="t('common.field')" width="120" />
              <el-table-column prop="type" :label="t('common.type')" width="120" />
              <el-table-column prop="required" :label="t('common.requiredColumn')" width="80" align="center" />
              <el-table-column prop="desc" :label="t('common.notes')" />
            </el-table>

            <h4 style="margin-bottom: 6px; margin-top: 4px">{{ t("agent.imagesFieldStructure") }}</h4>
            <el-text type="info" size="small" style="display: block; margin-bottom: 8px">
              {{ t("agent.imagesFieldHelp") }}
            </el-text>
            <el-table :data="imageParamDocs" size="small" border style="margin-bottom: 16px; font-size: 12px">
              <el-table-column prop="format" :label="t('common.format')" width="100" />
              <el-table-column prop="field" :label="t('common.field')" width="120" />
              <el-table-column prop="type" :label="t('common.type')" width="80" />
              <el-table-column prop="desc" :label="t('common.notes')" />
            </el-table>

            <el-divider />

            <h4 style="margin-bottom: 8px">{{ t("agent.chatPlainText") }}</h4>
            <pre style="font-size: 12px; white-space: pre-wrap; margin: 0">POST {{ baseUrl }}/api/chat

curl -X POST {{ baseUrl }}/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"message": "{{ t("agent.exampleHello") }}", "sessionId": "optional-session-id"}'</pre>

            <el-divider />

            <h4 style="margin-bottom: 8px">{{ t("agent.chatBase64") }}</h4>
            <pre style="font-size: 12px; white-space: pre-wrap; margin: 0">POST {{ baseUrl }}/api/chat

curl -X POST {{ baseUrl }}/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
  "message": "{{ t("agent.exampleDescribeImage") }}",
  "images": [
    {
      "type": "base64",
      "mediaType": "image/jpeg",
      "data": "/9j/4AAQSkZJRgAB..."
    }
  ]
}'</pre>

            <el-divider />

            <h4 style="margin-bottom: 8px">{{ t("agent.chatUrl") }}</h4>
            <pre style="font-size: 12px; white-space: pre-wrap; margin: 0">POST {{ baseUrl }}/api/chat

curl -X POST {{ baseUrl }}/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
  "message": "{{ t("agent.exampleDescribeImage") }}",
  "images": [
    {
      "type": "url",
      "url": "https://example.com/image.jpg"
    }
  ]
}'</pre>

            <el-divider />

            <h4 style="margin-bottom: 8px">{{ t("agent.chatStreaming") }}</h4>
            <pre style="font-size: 12px; white-space: pre-wrap; margin: 0">POST {{ baseUrl }}/api/chat/stream

curl -X POST {{ baseUrl }}/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"message": "{{ t("agent.exampleHello") }}"}'</pre>

            <el-divider />

            <h4 style="margin-bottom: 8px">{{ t("agent.sseEvents") }}</h4>
            <el-table :data="sseEventDocs" size="small" border style="font-size: 12px">
              <el-table-column prop="event" label="event.type" width="140" />
              <el-table-column prop="data" :label="t('agent.eventDataStructure')" width="220" />
              <el-table-column prop="desc" :label="t('common.notes')" />
            </el-table>
          </div>
        </div>
      </el-tab-pane>

      <!-- Tab 4: Test Chat -->
      <el-tab-pane :label="t('agent.testChat')" name="chat" :disabled="!isEdit">
        <div class="chat-container">
          <div class="chat-box" ref="chatBoxRef">
            <div v-for="(msg, i) in chatMessages" :key="i" :class="['chat-msg', msg.isSystemPrompt ? 'chat-msg-system' : `chat-msg-${msg.role}`]">
              <!-- System Prompt 折叠展示 -->
              <template v-if="msg.isSystemPrompt">
                <div class="chat-msg-system-header" @click="toggleSystemPrompt(i)">
                  <el-icon style="margin-right: 4px"><CaretRight v-if="!msg.systemPromptExpanded" /><CaretBottom v-else /></el-icon>
                  <el-tag size="small" type="info">{{ t("agent.systemPrompt") }}</el-tag>
                  <span style="margin-left: 6px; color: #909399; font-size: 12px">{{ t("agent.systemPromptChars", { count: msg.text.length.toLocaleString() }) }}</span>
                </div>
                <div v-if="msg.systemPromptExpanded" class="chat-msg-system-body">{{ msg.text }}</div>
              </template>
              <template v-else>
                <div class="chat-msg-role">{{ msg.role === 'user' ? t("agent.you") : t("agent.titleFallback") }}</div>
                <!-- 思考过程折叠展示 -->
                <div v-if="msg.thinking" class="chat-msg-thinking">
                  <div class="chat-msg-thinking-header" @click="toggleThinking(i)">
                    <el-icon style="margin-right: 4px"><CaretRight v-if="!msg.thinkingExpanded" /><CaretBottom v-else /></el-icon>
                    <span>{{ t("agent.thinkingProcess") }}</span>
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
                  <span v-if="msg.usage.cacheReadTokens" style="color: #67c23a"> · {{ msg.usage.cacheReadTokens.toLocaleString() }} {{ t("sessions.cache") }}</span>
                  · {{ (msg.usage.durationMs / 1000).toFixed(1) }}s
                </div>
              </template>
            </div>
            <div v-if="chatLoading" class="chat-msg chat-msg-assistant">
              <div class="chat-msg-role">{{ t("agent.titleFallback") }}</div>
              <div class="chat-msg-text" style="color: #909399">{{ t("agent.chatThinking") }}</div>
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
              <el-upload
                :show-file-list="false"
                :before-upload="handleChatImage"
                :disabled="selectedProvider && !selectedProvider.capabilities.supportsVision"
                accept="image/*"
                style="flex-shrink: 0"
              >
                <el-button :icon="Picture" circle />
              </el-upload>
              <el-input v-model="chatInput" :placeholder="t('agent.typeMessage')" @keyup.enter="sendChat" :disabled="chatLoading" style="flex: 1" />
              <el-button type="primary" @click="sendChat" :loading="chatLoading">{{ t("common.send") }}</el-button>
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
import { t } from "@/i18n";

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
  category: "",
  systemPrompt: "",
  providerId: "" as string,
  model: "",
  fallbackModels: [] as Array<{ providerId?: string; model: string }>,
  fallbackCooldownSeconds: 900,
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
interface ModelCapabilities {
  supportsTools: boolean;
  supportsVision: boolean;
  supportsThinking: boolean;
  supportsStreaming: boolean;
}
interface ProviderItem {
  id: string;
  name: string;
  defaultModel: string;
  isPrimary: boolean;
  capabilities: ModelCapabilities;
}
const availableProviders = ref<ProviderItem[]>([]);
const selectedProvider = computed(() => availableProviders.value.find(p => p.id === form.value.providerId));

function onProviderChange() {
  const provider = availableProviders.value.find(p => p.id === form.value.providerId);
  if (provider) form.value.model = provider.defaultModel;
}

function addFallbackModel() {
  const provider = availableProviders.value.find(p => p.id !== form.value.providerId) ?? availableProviders.value[0];
  form.value.fallbackModels.push({
    providerId: provider?.id,
    model: provider?.defaultModel ?? "",
  });
}

function removeFallbackModel(index: number) {
  form.value.fallbackModels.splice(index, 1);
}

function onFallbackProviderChange(index: number) {
  const fallback = form.value.fallbackModels[index];
  const provider = availableProviders.value.find(p => p.id === fallback?.providerId);
  if (fallback && provider) fallback.model = provider.defaultModel;
}

// API tab state
const apiKeys = ref<Array<{ id: string; keyPrefix: string; name: string; lastUsedAt: string | null }>>([]);
const newlyCreatedKey = ref("");
const agentUsage = ref({ totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0 });
const baseUrl = ref(window.location.origin);

// API 文档数据
const apiParamDocs = computed(() => [
  { field: "message", type: "string", required: t("common.optional"), desc: t("agent.apiDocMessageDesc") },
  { field: "sessionId", type: "string", required: t("common.optional"), desc: t("agent.apiDocSessionDesc") },
  { field: "images", type: "array", required: t("common.optional"), desc: t("agent.apiDocImagesDesc") },
]);

const imageParamDocs = computed(() => [
  { format: "base64", field: "type", type: "string", desc: t("agent.apiDocFixedBase64") },
  { format: "base64", field: "mediaType", type: "string", desc: t("agent.apiDocMediaType") },
  { format: "base64", field: "data", type: "string", desc: t("agent.apiDocBase64Data") },
  { format: "url", field: "type", type: "string", desc: t("agent.apiDocFixedUrl") },
  { format: "url", field: "url", type: "string", desc: t("agent.apiDocImageUrl") },
]);

const sseEventDocs = computed(() => [
  { event: "thinking", data: "string", desc: t("agent.sseThinkingDesc") },
  { event: "text", data: "string", desc: t("agent.sseTextDesc") },
  { event: "tool_call", data: '{ name: string, input: object }', desc: t("agent.sseToolCallDesc") },
  { event: "tool_result", data: '{ name: string, result: string }', desc: t("agent.sseToolResultDesc") },
  { event: "done", data: '{ reply, sessionId, usage }', desc: t("agent.sseDoneDesc") },
]);

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
    ElMessage.success(t("agent.kbUpdated"));
  } catch {
    ElMessage.error(t("agent.failedUpdate"));
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
        category: data.category ?? "",
        systemPrompt: data.systemPrompt,
        providerId: data.providerId ?? "",
        model: data.model,
        fallbackModels: data.fallbackModels ?? [],
        fallbackCooldownSeconds: data.fallbackCooldownSeconds ?? 900,
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
    ElMessage.error(t("agent.failedLoadData"));
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  if (!form.value.name || !form.value.systemPrompt) {
    ElMessage.warning(t("agent.requiredNamePrompt"));
    return;
  }
  saving.value = true;
  try {
    const payload = {
      ...form.value,
      thinking: selectedProvider.value?.capabilities.supportsThinking ? form.value.thinking : false,
    };
    if (isEdit.value) {
      await updateAgent(agentId.value, payload);
      ElMessage.success(t("agent.updated"));
    } else {
      const { data } = await createAgent(payload);
      ElMessage.success(t("agent.created"));
      // Show the raw key immediately
      if (data.apiKeys?.[0]?.rawKey) {
        newlyCreatedKey.value = data.apiKeys[0].rawKey;
      }
      router.replace(`/agents/${data.id}/edit`);
    }
  } catch {
    ElMessage.error(t("agent.failedSave"));
  } finally {
    saving.value = false;
  }
}

async function generateKey() {
  try {
    const { value: keyName } = await ElMessageBox.prompt(t("agent.keyPromptMessage"), t("agent.newApiKey"), {
      inputValue: "",
      inputPlaceholder: t("agent.keyPromptPlaceholder"),
      confirmButtonText: t("agent.generate"),
      cancelButtonText: t("common.cancel"),
    });
    const name = keyName?.trim() || t("common.default");
    const { data } = await createApiKey(agentId.value, name);
    newlyCreatedKey.value = data.rawKey;
    apiKeys.value.unshift(data);
    ElMessage.success(t("agent.apiKeyGenerated"));
  } catch {
    // user cancelled or error
  }
}

async function revokeKey(keyId: string) {
  try {
    await deleteApiKey(agentId.value, keyId);
    apiKeys.value = apiKeys.value.filter((k) => k.id !== keyId);
    ElMessage.success(t("agent.keyRevoked"));
  } catch {
    ElMessage.error(t("agent.failedRevoke"));
  }
}

function copyKey(key: string) {
  navigator.clipboard.writeText(key);
  ElMessage.success(t("common.copied"));
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
    const errMsg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t("common.requestFailed");
    chatMessages.value.push({ role: "assistant", text: t("agent.errorPrefix", { message: errMsg }) });
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
      chatMessages.value.push({ role: "assistant", text: t("agent.errorPrefix", { message: t("common.httpError", { status: response.status }) }) });
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
    chatMessages.value.push({ role: "assistant", text: t("agent.errorPrefix", { message: (e as Error).message }) });
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
.model-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
</style>
