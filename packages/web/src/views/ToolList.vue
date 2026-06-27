<template>
  <div>
    <div class="page-header">
      <span></span>
    </div>

    <!-- All registered tools (builtin + HTTP) -->
    <el-table :data="tools" v-loading="loading" stripe>
      <el-table-column prop="name" :label="t('common.name')" width="200" />
      <el-table-column prop="description" :label="t('common.description')" />
      <el-table-column :label="t('common.parameters')" width="120" align="center">
        <template #default="{ row }">
          <el-button link type="primary" @click="showSchema(row)">{{ t("tools.viewSchema") }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Schema dialog -->
    <el-dialog v-model="schemaVisible" :title="t('tools.schemaTitle', { name: selectedTool?.name || '' })" width="600px">
      <pre style="background: #f5f7fa; padding: 16px; border-radius: 4px; overflow: auto; font-size: 13px">{{ schemaJson }}</pre>
    </el-dialog>

    <!-- HTTP API Tools management section -->
    <el-divider />
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h3>{{ t("tools.httpApiTools") }}</h3>
      <el-button type="primary" @click="openCreate">{{ t("tools.addHttpTool") }}</el-button>
    </div>
    <el-text type="info" size="small" style="display: block; margin-bottom: 16px">
      {{ t("tools.httpApiHelp") }}
    </el-text>

    <el-table :data="httpTools" v-loading="httpLoading" stripe>
      <el-table-column prop="name" :label="t('common.name')" width="180" />
      <el-table-column :label="t('common.category')" width="140">
        <template #default="{ row }">
          <el-tag v-if="row.category" size="small">{{ row.category }}</el-tag>
          <span v-else style="color: #c0c4cc">{{ t("common.uncategorized") }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="method" :label="t('common.method')" width="80" />
      <el-table-column prop="url" :label="t('common.url')" />
      <el-table-column :label="t('common.status')" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? t("common.on") : t("common.off") }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="220" align="center">
        <template #default="{ row }">
          <el-button link type="success" @click="openTest(row)">{{ t("tools.test") }}</el-button>
          <el-button link type="primary" @click="openEdit(row)">{{ t("common.edit") }}</el-button>
          <el-popconfirm :title="t('tools.deleteConfirm')" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger">{{ t("common.delete") }}</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- HTTP Tool test dialog -->
    <el-dialog v-model="testVisible" :title="t('tools.testTitle', { name: testTool?.name || '' })" width="600px">
      <el-form label-width="100px" v-if="testTool">
        <el-form-item v-for="param in testParams" :key="param.name" :label="param.name">
          <el-input v-model="param.value" :placeholder="param.description" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="testVisible = false">{{ t("common.close") }}</el-button>
        <el-button type="primary" @click="runTest" :loading="testing">{{ t("tools.sendRequest") }}</el-button>
      </template>
      <div v-if="testResult !== null" style="margin-top: 12px">
        <el-divider />
        <el-tag :type="testResultError ? 'danger' : 'success'" size="small" style="margin-bottom: 8px">
          {{ testResultError ? t("common.error") : t("common.success") }}
        </el-tag>
        <pre style="background: #f5f7fa; padding: 12px; border-radius: 4px; font-size: 12px; max-height: 300px; overflow: auto; white-space: pre-wrap; word-break: break-all">{{ testResult }}</pre>
      </div>
    </el-dialog>

    <!-- HTTP Tool create/edit dialog -->
    <el-dialog v-model="formVisible" :title="editingTool ? t('tools.editHttpTool') : t('tools.createHttpTool')" width="650px">
      <el-form :model="form" label-width="120px">
        <el-form-item :label="t('common.name')" required>
          <el-input v-model="form.name" placeholder="e.g. query_order" />
        </el-form-item>
        <el-form-item :label="t('common.description')">
          <el-input v-model="form.description" :placeholder="t('skills.descriptionPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('common.category')">
          <el-input v-model="form.category" :placeholder="t('agent.optionalCategory')" />
        </el-form-item>
        <el-form-item :label="t('common.method')">
          <el-select v-model="form.method" style="width: 120px">
            <el-option label="GET" value="GET" />
            <el-option label="POST" value="POST" />
            <el-option label="PUT" value="PUT" />
            <el-option label="DELETE" value="DELETE" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.url')" required>
          <el-input v-model="form.url" placeholder="https://api.example.com/orders/{orderId}" />
          <el-text type="info" size="small">{{ t("tools.useParamsHelp") }}</el-text>
        </el-form-item>
        <el-form-item :label="t('common.headers')">
          <el-input v-model="form.headersStr" type="textarea" :rows="3"
            placeholder='{"Authorization": "Bearer xxx"}' />
        </el-form-item>
        <el-form-item :label="t('common.parameters')">
          <el-input v-model="form.parametersStr" type="textarea" :rows="5"
            :placeholder='parameterPlaceholder' />
          <el-text type="info" size="small">{{ t("tools.jsonSchemaHelp") }}</el-text>
        </el-form-item>
        <el-form-item :label="t('common.bodyTemplate')" v-if="['POST','PUT','PATCH'].includes(form.method)">
          <el-input v-model="form.bodyTemplate" type="textarea" :rows="4"
            placeholder='{"orderId": "{orderId}", "status": "{status}"}' />
        </el-form-item>
        <el-form-item :label="t('common.enabled')">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">{{ t("common.save") }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { getTools, getHttpTools, createHttpTool, updateHttpTool, deleteHttpTool, testHttpTool } from "@/api";
import { ElMessage } from "element-plus";
import { t } from "@/i18n";

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface HttpToolItem {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  parameters: Record<string, unknown>;
  bodyTemplate: string;
  enabled: boolean;
  category?: string;
}

const allTools = ref<ToolDef[]>([]);
const httpTools = ref<HttpToolItem[]>([]);

// Builtin tools = all registered tools minus HTTP tools
const HIDDEN_TOOLS = new Set(["search_knowledge"]);
const tools = computed(() => {
  const httpNames = new Set(httpTools.value.map(t => t.name));
  return allTools.value.filter(t => !httpNames.has(t.name) && !HIDDEN_TOOLS.has(t.name));
});
const loading = ref(false);
const httpLoading = ref(false);
const saving = ref(false);

// Schema viewer
const schemaVisible = ref(false);
const selectedTool = ref<ToolDef | null>(null);
const schemaJson = ref("");

// HTTP tool form
const formVisible = ref(false);
const editingTool = ref<HttpToolItem | null>(null);
const form = ref({
  name: "",
  description: "",
  method: "GET",
  url: "",
  headersStr: "{}",
  parametersStr: "",
  bodyTemplate: "",
  enabled: true,
  category: "",
});

const parameterPlaceholder = `{
  "type": "object",
  "properties": {
    "orderId": { "type": "string", "description": "Order ID" }
  },
  "required": ["orderId"]
}`;

// Test tool state
const testVisible = ref(false);
const testTool = ref<HttpToolItem | null>(null);
const testParams = ref<Array<{ name: string; description: string; value: string }>>([]);
const testResult = ref<string | null>(null);
const testResultError = ref(false);
const testing = ref(false);

function openTest(tool: HttpToolItem) {
  testTool.value = tool;
  testResult.value = null;
  testResultError.value = false;
  const props = (tool.parameters as { properties?: Record<string, { description?: string }> })?.properties ?? {};
  testParams.value = Object.entries(props).map(([name, schema]) => ({
    name,
    description: schema.description ?? "",
    value: "",
  }));
  testVisible.value = true;
}

async function runTest() {
  if (!testTool.value) return;
  testing.value = true;
  testResult.value = null;

  const params: Record<string, string> = {};
  for (const p of testParams.value) {
    params[p.name] = p.value;
  }

  try {
    const { data } = await testHttpTool(testTool.value.id, params);
    testResultError.value = !data.ok;
    if (data.error) {
      testResult.value = data.error;
    } else {
      testResult.value = typeof data.body === "string" ? data.body : JSON.stringify(data.body, null, 2);
    }
  } catch (e) {
    testResultError.value = true;
    testResult.value = t("tools.requestFailedWithMessage", { message: (e as Error).message });
  } finally {
    testing.value = false;
  }
}

async function loadTools() {
  loading.value = true;
  try {
    const { data } = await getTools();
    allTools.value = data;
  } catch {
    ElMessage.error(t("tools.failedLoad"));
  } finally {
    loading.value = false;
  }
}

async function loadHttpTools() {
  httpLoading.value = true;
  try {
    const { data } = await getHttpTools();
    httpTools.value = data;
  } catch {
    // API might not exist yet
  } finally {
    httpLoading.value = false;
  }
}

function showSchema(tool: ToolDef) {
  selectedTool.value = tool;
  schemaJson.value = JSON.stringify(tool.parameters, null, 2);
  schemaVisible.value = true;
}

function openCreate() {
  editingTool.value = null;
  form.value = {
    name: "", description: "", method: "GET", url: "",
    headersStr: "{}", parametersStr: parameterPlaceholder,
    bodyTemplate: "", enabled: true, category: "",
  };
  formVisible.value = true;
}

function openEdit(tool: HttpToolItem) {
  editingTool.value = tool;
  form.value = {
    name: tool.name,
    description: tool.description,
    method: tool.method,
    url: tool.url,
    headersStr: JSON.stringify(tool.headers, null, 2),
    parametersStr: JSON.stringify(tool.parameters, null, 2),
    bodyTemplate: tool.bodyTemplate,
    enabled: tool.enabled,
    category: tool.category ?? "",
  };
  formVisible.value = true;
}

async function handleSave() {
  if (!form.value.name || !form.value.url) {
    ElMessage.warning(t("tools.nameUrlRequired"));
    return;
  }
  let headers: Record<string, string>;
  let parameters: Record<string, unknown>;
  try {
    headers = JSON.parse(form.value.headersStr);
    parameters = form.value.parametersStr ? JSON.parse(form.value.parametersStr) : { type: "object", properties: {} };
  } catch {
    ElMessage.error(t("tools.invalidJson"));
    return;
  }

  saving.value = true;
  try {
    const payload = {
      name: form.value.name,
      description: form.value.description,
      method: form.value.method,
      url: form.value.url,
      headers,
      parameters,
      bodyTemplate: form.value.bodyTemplate,
      enabled: form.value.enabled,
      category: form.value.category,
    };
    if (editingTool.value) {
      await updateHttpTool(editingTool.value.id, payload);
    } else {
      await createHttpTool(payload);
    }
    ElMessage.success(t("tools.saved"));
    formVisible.value = false;
    loadHttpTools();
    loadTools();
  } catch {
    ElMessage.error(t("tools.failedSave"));
  } finally {
    saving.value = false;
  }
}

async function handleDelete(id: string) {
  try {
    await deleteHttpTool(id);
    ElMessage.success(t("tools.deleted"));
    loadHttpTools();
    loadTools();
  } catch {
    ElMessage.error(t("tools.failedDelete"));
  }
}

onMounted(() => {
  loadTools();
  loadHttpTools();
});
</script>
