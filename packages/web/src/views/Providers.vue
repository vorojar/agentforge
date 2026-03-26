<template>
  <div>
    <div class="page-header">
      <span></span>
      <el-button type="primary" @click="openCreate">Add Provider</el-button>
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
            <div><strong>Default Model:</strong> {{ p.defaultModel }}</div>
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px">
            <el-button size="small" @click="openEdit(p)">Edit</el-button>
            <el-button size="small" v-if="!p.isPrimary" @click="setPrimary(p.id)">Set Primary</el-button>
            <el-popconfirm title="Delete this provider?" @confirm="handleDelete(p.id)">
              <template #reference>
                <el-button size="small" type="danger">Delete</el-button>
              </template>
            </el-popconfirm>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="formVisible" :title="editingProvider ? 'Edit Provider' : 'Add Provider'" width="550px">
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
        <el-form-item label="Default Model" required>
          <el-input v-model="form.defaultModel" placeholder="e.g. gpt-4o, doubao-seed-2-0-lite-260215" />
        </el-form-item>
        <el-form-item label="Enabled">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="Primary">
          <el-switch v-model="form.isPrimary" />
          <el-text type="info" size="small" style="margin-left: 8px">Agents without a provider will use this one</el-text>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">Cancel</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">Save</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getProviders, createProviderApi, updateProviderApi, deleteProviderApi } from "@/api";
import { ElMessage } from "element-plus";

interface ProviderItem {
  id: string; name: string; type: string; apiKey: string;
  baseUrl?: string; defaultModel: string; enabled: boolean; isPrimary: boolean;
}

const providers = ref<ProviderItem[]>([]);
const formVisible = ref(false);
const editingProvider = ref<ProviderItem | null>(null);
const saving = ref(false);
const form = ref({
  name: "", type: "openai", apiKey: "", baseUrl: "",
  defaultModel: "", enabled: true, isPrimary: false,
});

async function loadProviders() {
  try {
    const { data } = await getProviders();
    providers.value = data;
  } catch {
    ElMessage.error("Failed to load providers");
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
    ElMessage.warning("Name, Type, and Default Model are required");
    return;
  }
  if (!editingProvider.value && !form.value.apiKey) {
    ElMessage.warning("API Key is required");
    return;
  }
  saving.value = true;
  try {
    const payload: Record<string, unknown> = { ...form.value };
    // Don't send empty apiKey on edit (keep existing)
    if (editingProvider.value && !form.value.apiKey) delete payload.apiKey;
    if (!form.value.baseUrl) delete payload.baseUrl;

    if (editingProvider.value) {
      await updateProviderApi(editingProvider.value.id, payload);
    } else {
      await createProviderApi(payload);
    }
    ElMessage.success("Provider saved");
    formVisible.value = false;
    loadProviders();
  } catch {
    ElMessage.error("Failed to save provider");
  } finally {
    saving.value = false;
  }
}

async function setPrimary(id: string) {
  try {
    await updateProviderApi(id, { isPrimary: true });
    ElMessage.success("Primary provider updated");
    loadProviders();
  } catch {
    ElMessage.error("Failed to set primary");
  }
}

async function handleDelete(id: string) {
  try {
    await deleteProviderApi(id);
    ElMessage.success("Provider deleted");
    loadProviders();
  } catch {
    ElMessage.error("Failed to delete provider");
  }
}

onMounted(loadProviders);
</script>

<style scoped>
.provider-primary {
  border-color: #67c23a;
}
</style>
