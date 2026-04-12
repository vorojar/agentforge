<!--
  Model 管理页面
  功能：Model CRUD + 渠道管理（密钥生成、统计、接入示例）
  创建时间：2026-03-31
  负责人：王觉贤
  最后更新时间：2026-04-03
-->
<template>
  <div>
    <div class="page-header">
      <span></span>
      <el-button type="primary" @click="openCreate">Add Model</el-button>
    </div>

    <el-row :gutter="20">
      <el-col :span="8" v-for="p in providers" :key="p.id" style="margin-bottom: 16px">
        <el-card shadow="hover" :class="{ 'provider-primary': p.isPrimary }">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-weight: 600">{{ p.name }}</span>
              <div style="display: flex; gap: 6px; align-items: center">
                <el-tag v-if="p.isPrimary" type="success" size="small">Primary</el-tag>
                <el-tag :type="p.enabled ? 'success' : 'info'" size="small">
                  {{ p.enabled ? "On" : "Off" }}
                </el-tag>
              </div>
            </div>
          </template>
          <div style="font-size: 13px; color: #606266; line-height: 2">
            <div><strong>Type:</strong> {{ p.type }}</div>
            <div><strong>API Key:</strong> <code>{{ p.apiKey }}</code></div>
            <div v-if="p.baseUrl"><strong>Base URL:</strong> {{ p.baseUrl }}</div>
            <div><strong>Model:</strong> {{ p.defaultModel }}</div>
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap">
            <el-button size="small" @click="openEdit(p)">Edit</el-button>
            <el-button size="small" type="warning" @click="openChannels(p)">Channels</el-button>
            <el-button size="small" v-if="!p.isPrimary" @click="setPrimary(p.id)">Set Primary</el-button>
            <el-popconfirm title="Delete this model?" @confirm="handleDelete(p.id)">
              <template #reference>
                <el-button size="small" type="danger">Delete</el-button>
              </template>
            </el-popconfirm>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Provider Form Dialog -->
    <el-dialog v-model="formVisible" :title="editingProvider ? 'Edit Model' : 'Add Model'" width="550px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="Name" required>
          <el-input v-model="form.name" placeholder="e.g. 火山引擎 (豆包)" />
        </el-form-item>
        <el-form-item label="Type" required>
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="OpenAI Compatible" value="openai" />
            <el-option label="Anthropic Claude" value="claude" />
          </el-select>
        </el-form-item>
        <el-form-item label="API Key" required>
          <el-input v-model="form.apiKey" type="password" show-password placeholder="sk-..." />
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="form.baseUrl" placeholder="https://api.openai.com/v1 (optional)" />
          <el-text type="info" size="small">Required for OpenAI-compatible providers (e.g. 豆包, DeepSeek)</el-text>
        </el-form-item>
        <el-form-item label="Model Name" required>
          <el-input v-model="form.defaultModel" placeholder="e.g. gpt-4o, doubao-seed-2-0-lite-260215" />
        </el-form-item>
        <el-form-item label="Enabled">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="Primary">
          <el-switch v-model="form.isPrimary" />
          <el-text type="info" size="small" style="margin-left: 8px">Agents without a model will use this one</el-text>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">Cancel</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">Save</el-button>
      </template>
    </el-dialog>

    <!-- Channels Dialog -->
    <el-dialog v-model="channelVisible" :title="'Channels: ' + channelProvider?.name" width="900px" top="3vh">
      <div style="margin-bottom: 16px">
        <p style="color: #909399; font-size: 13px; margin-bottom: 12px">
          Create API keys for independent forwarding. Each channel has its own key and usage statistics.
          The forwarding endpoint is fully <strong>OpenAI-compatible</strong>.
        </p>
        <div style="display: flex; gap: 8px; align-items: center">
          <el-input v-model="newChannelName" placeholder="Channel name (e.g. iOS App, Backend)" style="width: 250px" />
          <el-button type="primary" :loading="creatingChannel" @click="handleCreateChannel">Create Channel</el-button>
        </div>
      </div>

      <!-- Newly created key alert -->
      <el-alert v-if="newlyCreatedChannelKey" type="success" :closable="false" style="margin-bottom: 16px">
        <p>New channel key created. Copy it now — it won't be shown again:</p>
        <code style="font-size: 14px; font-weight: bold; display: block; margin-top: 4px">{{ newlyCreatedChannelKey }}</code>
        <el-button size="small" style="margin-top: 8px" @click="copyKey(newlyCreatedChannelKey)">Copy</el-button>
      </el-alert>

      <el-table :data="channels" size="small" v-loading="channelLoading" empty-text="No channels yet">
        <el-table-column prop="name" label="Channel" min-width="120" />
        <el-table-column prop="keyPrefix" label="Key Prefix" width="120">
          <template #default="{ row }"><code>{{ row.keyPrefix }}...</code></template>
        </el-table-column>
        <el-table-column label="Requests" width="90" align="center">
          <template #default="{ row }">{{ channelStatsMap[row.id]?.totalRequests ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="Tokens In" width="100" align="center">
          <template #default="{ row }">{{ (channelStatsMap[row.id]?.totalTokensIn ?? 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="Tokens Out" width="100" align="center">
          <template #default="{ row }">{{ (channelStatsMap[row.id]?.totalTokensOut ?? 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="Created" width="110">
          <template #default="{ row }">{{ row.createdAt?.slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column label="" width="80" align="center">
          <template #default="{ row }">
            <el-popconfirm title="Delete this channel?" @confirm="handleDeleteChannel(row.id)">
              <template #reference>
                <el-button link type="danger" size="small">Delete</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <!-- API Usage Examples -->
      <el-divider />
      <el-collapse v-model="exampleCollapse">
        <el-collapse-item title="API Usage Examples (click to expand)" name="examples">
          <div class="example-section">
            <div class="example-header">
              <span class="example-info">
                Endpoint: <code>{{ apiBaseUrl }}/v1/chat/completions</code>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                Model: <code>{{ channelProvider?.defaultModel }}</code>
              </span>
            </div>

            <el-tabs v-model="exampleTab">
              <el-tab-pane label="cURL" name="curl">
                <div class="code-block">
                  <el-button class="copy-btn" size="small" link @click="copyCode('curl')">Copy</el-button>
                  <pre><code>{{ curlExample }}</code></pre>
                </div>
              </el-tab-pane>
              <el-tab-pane label="Python" name="python">
                <div class="code-block">
                  <el-button class="copy-btn" size="small" link @click="copyCode('python')">Copy</el-button>
                  <pre><code>{{ pythonExample }}</code></pre>
                </div>
              </el-tab-pane>
              <el-tab-pane label="JavaScript" name="javascript">
                <div class="code-block">
                  <el-button class="copy-btn" size="small" link @click="copyCode('javascript')">Copy</el-button>
                  <pre><code>{{ jsExample }}</code></pre>
                </div>
              </el-tab-pane>
              <el-tab-pane label="Python (OpenAI SDK)" name="openai-sdk">
                <div class="code-block">
                  <el-button class="copy-btn" size="small" link @click="copyCode('openai-sdk')">Copy</el-button>
                  <pre><code>{{ openaiSdkExample }}</code></pre>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import {
  getProviders, createProviderApi, updateProviderApi, deleteProviderApi,
  getChannels, createChannel, deleteChannel, getProviderChannelStats,
} from "@/api";
import { ElMessage } from "element-plus";

interface ProviderItem {
  id: string; name: string; type: string; apiKey: string;
  baseUrl?: string; defaultModel: string; enabled: boolean; isPrimary: boolean;
}

interface ChannelItem {
  id: string; providerId: string; name: string; keyHash: string;
  keyPrefix: string; enabled: boolean; createdAt: string;
}

interface ChannelStatItem {
  channelId: string; channelName: string;
  totalRequests: number; totalTokensIn: number; totalTokensOut: number;
}

const exampleCollapse = ref<string[]>([]);
const exampleTab = ref("curl");
const apiBaseUrl = computed(() => window.location.origin);
const exampleKey = computed(() => newlyCreatedChannelKey.value || "af-ch-YOUR_CHANNEL_KEY");
const exampleModel = computed(() => channelProvider.value?.defaultModel || "your-model-name");

const curlExample = computed(() =>
`curl -X POST ${apiBaseUrl.value}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${exampleKey.value}" \\
  -d '{
    "model": "${exampleModel.value}",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "max_tokens": 1000,
    "stream": false
  }'`);

const pythonExample = computed(() =>
`import requests

response = requests.post(
    "${apiBaseUrl.value}/v1/chat/completions",
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer ${exampleKey.value}",
    },
    json={
        "model": "${exampleModel.value}",
        "messages": [{"role": "user", "content": "Hello!"}],
        "max_tokens": 1000,
    },
)
data = response.json()
print(data["choices"][0]["message"]["content"])`);

const jsExample = computed(() =>
`const response = await fetch("${apiBaseUrl.value}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${exampleKey.value}",
  },
  body: JSON.stringify({
    model: "${exampleModel.value}",
    messages: [{ role: "user", content: "Hello!" }],
    max_tokens: 1000,
  }),
});
const data = await response.json();
console.log(data.choices[0].message.content);`);

const openaiSdkExample = computed(() =>
`from openai import OpenAI

client = OpenAI(
    api_key="${exampleKey.value}",
    base_url="${apiBaseUrl.value}/v1",
)

response = client.chat.completions.create(
    model="${exampleModel.value}",
    messages=[{"role": "user", "content": "Hello!"}],
    max_tokens=1000,
)
print(response.choices[0].message.content)`);

const providers = ref<ProviderItem[]>([]);
const formVisible = ref(false);
const editingProvider = ref<ProviderItem | null>(null);
const saving = ref(false);
const form = ref({
  name: "", type: "openai", apiKey: "", baseUrl: "",
  defaultModel: "", enabled: true, isPrimary: false,
});

const channelVisible = ref(false);
const channelProvider = ref<ProviderItem | null>(null);
const channels = ref<ChannelItem[]>([]);
const channelLoading = ref(false);
const creatingChannel = ref(false);
const newChannelName = ref("");
const newlyCreatedChannelKey = ref("");
const channelStatsMap = ref<Record<string, ChannelStatItem>>({});

async function loadProviders() {
  try {
    const { data } = await getProviders();
    providers.value = data;
  } catch {
    ElMessage.error("Failed to load models");
  }
}

function openCreate() {
  editingProvider.value = null;
  form.value = { name: "", type: "openai", apiKey: "", baseUrl: "", defaultModel: "", enabled: true, isPrimary: false };
  formVisible.value = true;
}

function openEdit(p: ProviderItem) {
  editingProvider.value = p;
  form.value = { name: p.name, type: p.type, apiKey: "", baseUrl: p.baseUrl ?? "", defaultModel: p.defaultModel, enabled: p.enabled, isPrimary: p.isPrimary };
  formVisible.value = true;
}

async function handleSave() {
  if (!form.value.name || !form.value.type || !form.value.defaultModel) {
    ElMessage.warning("Name, Type, and Model Name are required");
    return;
  }
  if (!editingProvider.value && !form.value.apiKey) {
    ElMessage.warning("API Key is required");
    return;
  }
  saving.value = true;
  try {
    const payload: Record<string, unknown> = { ...form.value };
    if (editingProvider.value && !form.value.apiKey) delete payload.apiKey;
    if (!form.value.baseUrl) delete payload.baseUrl;

    if (editingProvider.value) {
      await updateProviderApi(editingProvider.value.id, payload);
    } else {
      await createProviderApi(payload);
    }
    ElMessage.success("Model saved");
    formVisible.value = false;
    loadProviders();
  } catch {
    ElMessage.error("Failed to save model");
  } finally {
    saving.value = false;
  }
}

async function setPrimary(id: string) {
  try {
    await updateProviderApi(id, { isPrimary: true });
    ElMessage.success("Primary model updated");
    loadProviders();
  } catch {
    ElMessage.error("Failed to set primary model");
  }
}

async function handleDelete(id: string) {
  try {
    await deleteProviderApi(id);
    ElMessage.success("Model deleted");
    loadProviders();
  } catch {
    ElMessage.error("Failed to delete model");
  }
}

async function openChannels(p: ProviderItem) {
  channelProvider.value = p;
  newChannelName.value = "";
  newlyCreatedChannelKey.value = "";
  channelVisible.value = true;
  await loadChannels(p.id);
}

async function loadChannels(providerId: string) {
  channelLoading.value = true;
  try {
    const [channelsRes, statsRes] = await Promise.all([
      getChannels(providerId),
      getProviderChannelStats(providerId),
    ]);
    channels.value = channelsRes.data;
    const map: Record<string, ChannelStatItem> = {};
    for (const s of statsRes.data) {
      map[s.channelId] = s;
    }
    channelStatsMap.value = map;
  } catch {
    ElMessage.error("Failed to load channels");
  } finally {
    channelLoading.value = false;
  }
}

async function handleCreateChannel() {
  if (!channelProvider.value || !newChannelName.value.trim()) {
    ElMessage.warning("Channel name is required");
    return;
  }
  creatingChannel.value = true;
  try {
    const { data } = await createChannel(channelProvider.value.id, newChannelName.value.trim());
    newlyCreatedChannelKey.value = data.rawKey;
    newChannelName.value = "";
    ElMessage.success("Channel created");
    await loadChannels(channelProvider.value.id);
  } catch {
    ElMessage.error("Failed to create channel");
  } finally {
    creatingChannel.value = false;
  }
}

async function handleDeleteChannel(channelId: string) {
  if (!channelProvider.value) return;
  try {
    await deleteChannel(channelProvider.value.id, channelId);
    ElMessage.success("Channel deleted");
    await loadChannels(channelProvider.value.id);
  } catch {
    ElMessage.error("Failed to delete channel");
  }
}

function copyKey(key: string) {
  navigator.clipboard.writeText(key);
  ElMessage.success("Copied to clipboard");
}

function copyCode(tab: string) {
  const codeMap: Record<string, string> = {
    curl: curlExample.value,
    python: pythonExample.value,
    javascript: jsExample.value,
    "openai-sdk": openaiSdkExample.value,
  };
  navigator.clipboard.writeText(codeMap[tab] ?? "");
  ElMessage.success("Code copied to clipboard");
}

onMounted(loadProviders);
</script>

<style scoped>
.provider-primary {
  border-color: #67c23a;
}
.example-section {
  padding: 0 4px;
}
.example-header {
  margin-bottom: 12px;
}
.example-info {
  font-size: 13px;
  color: #606266;
}
.example-info code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  color: #409eff;
}
.code-block {
  position: relative;
  background: #1e1e1e;
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
}
.code-block pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}
.code-block code {
  color: #d4d4d4;
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 13px;
  line-height: 1.6;
}
.copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  color: #909399 !important;
  z-index: 1;
}
.copy-btn:hover {
  color: #409eff !important;
}
</style>
