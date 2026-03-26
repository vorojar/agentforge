<template>
  <div>
    <div class="page-header">
      <span></span>
    </div>

    <!-- All registered tools (builtin + HTTP) -->
    <el-table :data="tools" v-loading="loading" stripe>
      <el-table-column prop="name" label="Name" width="200" />
      <el-table-column prop="description" label="Description" />
      <el-table-column label="Parameters" width="120" align="center">
        <template #default="{ row }">
          <el-button link type="primary" @click="showSchema(row)">View Schema</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Schema dialog -->
    <el-dialog v-model="schemaVisible" :title="`${selectedTool?.name} — Parameters`" width="600px">
      <pre style="background: #f5f7fa; padding: 16px; border-radius: 4px; overflow: auto; font-size: 13px">{{ schemaJson }}</pre>
    </el-dialog>

    <!-- HTTP API Tools management section -->
    <el-divider />
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h3>HTTP API Tools</h3>
      <el-button type="primary" @click="openCreate">Add HTTP API Tool</el-button>
    </div>
    <el-text type="info" size="small" style="display: block; margin-bottom: 16px">
      Configure external HTTP APIs as tools. Agents can call these APIs during conversations.
    </el-text>

    <el-table :data="httpTools" v-loading="httpLoading" stripe>
      <el-table-column prop="name" label="Name" width="180" />
      <el-table-column prop="method" label="Method" width="80" />
      <el-table-column prop="url" label="URL" />
      <el-table-column label="Status" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? "On" : "Off" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Actions" width="220" align="center">
        <template #default="{ row }">
          <el-button link type="success" @click="openTest(row)">Test</el-button>
          <el-button link type="primary" @click="openEdit(row)">Edit</el-button>
          <el-popconfirm title="Delete this tool?" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger">Delete</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- HTTP Tool test dialog -->
    <el-dialog v-model="testVisible" :title="`Test: ${testTool?.name}`" width="600px">
      <el-form label-width="100px" v-if="testTool">
        <el-form-item v-for="param in testParams" :key="param.name" :label="param.name">
          <el-input v-model="param.value" :placeholder="param.description" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="testVisible = false">Close</el-button>
        <el-button type="primary" @click="runTest" :loading="testing">Send Request</el-button>
      </template>
      <div v-if="testResult !== null" style="margin-top: 12px">
        <el-divider />
        <el-tag :type="testResultError ? 'danger' : 'success'" size="small" style="margin-bottom: 8px">
          {{ testResultError ? 'Error' : 'Success' }}
        </el-tag>
        <pre style="background: #f5f7fa; padding: 12px; border-radius: 4px; font-size: 12px; max-height: 300px; overflow: auto; white-space: pre-wrap; word-break: break-all">{{ testResult }}</pre>
      </div>
    </el-dialog>

    <!-- HTTP Tool create/edit dialog -->
    <el-dialog v-model="formVisible" :title="editingTool ? 'Edit HTTP Tool' : 'Create HTTP Tool'" width="650px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="Name" required>
          <el-input v-model="form.name" placeholder="e.g. query_order" />
        </el-form-item>
        <el-form-item label="Description">
          <el-input v-model="form.description" placeholder="What this tool does" />
        </el-form-item>
        <el-form-item label="Method">
          <el-select v-model="form.method" style="width: 120px">
            <el-option label="GET" value="GET" />
            <el-option label="POST" value="POST" />
            <el-option label="PUT" value="PUT" />
            <el-option label="DELETE" value="DELETE" />
          </el-select>
        </el-form-item>
        <el-form-item label="URL" required>
          <el-input v-model="form.url" placeholder="https://api.example.com/orders/{orderId}" />
          <el-text type="info" size="small">Use {paramName} for URL path parameters</el-text>
        </el-form-item>
        <el-form-item label="Headers">
          <el-input v-model="form.headersStr" type="textarea" :rows="3"
            placeholder='{"Authorization": "Bearer xxx"}' />
        </el-form-item>
        <el-form-item label="Parameters">
          <el-input v-model="form.parametersStr" type="textarea" :rows="5"
            :placeholder='parameterPlaceholder' />
          <el-text type="info" size="small">JSON Schema format defining tool parameters</el-text>
        </el-form-item>
        <el-form-item label="Body Template" v-if="['POST','PUT','PATCH'].includes(form.method)">
          <el-input v-model="form.bodyTemplate" type="textarea" :rows="4"
            placeholder='{"orderId": "{orderId}", "status": "{status}"}' />
        </el-form-item>
        <el-form-item label="Enabled">
          <el-switch v-model="form.enabled" />
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
import { ref, onMounted, computed } from "vue";
import { getTools, getHttpTools, createHttpTool, updateHttpTool, deleteHttpTool } from "@/api";
import { ElMessage } from "element-plus";

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

  let url = testTool.value.url;
  let body = testTool.value.bodyTemplate || "";
  for (const p of testParams.value) {
    url = url.replaceAll(`{${p.name}}`, encodeURIComponent(p.value));
    body = body.replaceAll(`{${p.name}}`, p.value);
  }

  try {
    const options: RequestInit = {
      method: testTool.value.method,
      headers: { ...testTool.value.headers, "Content-Type": "application/json" },
    };
    if (["POST", "PUT", "PATCH"].includes(testTool.value.method.toUpperCase()) && body) {
      options.body = body;
    }
    const res = await fetch(url, options);
    const text = await res.text();
    testResultError.value = !res.ok;
    try {
      testResult.value = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      testResult.value = text;
    }
  } catch (e) {
    testResultError.value = true;
    testResult.value = `Request failed: ${(e as Error).message}`;
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
    ElMessage.error("Failed to load tools");
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
    bodyTemplate: "", enabled: true,
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
  };
  formVisible.value = true;
}

async function handleSave() {
  if (!form.value.name || !form.value.url) {
    ElMessage.warning("Name and URL are required");
    return;
  }
  let headers: Record<string, string>;
  let parameters: Record<string, unknown>;
  try {
    headers = JSON.parse(form.value.headersStr);
    parameters = form.value.parametersStr ? JSON.parse(form.value.parametersStr) : { type: "object", properties: {} };
  } catch {
    ElMessage.error("Invalid JSON in headers or parameters");
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
    };
    if (editingTool.value) {
      await updateHttpTool(editingTool.value.id, payload);
    } else {
      await createHttpTool(payload);
    }
    ElMessage.success("Tool saved");
    formVisible.value = false;
    loadHttpTools();
    loadTools();
  } catch {
    ElMessage.error("Failed to save tool");
  } finally {
    saving.value = false;
  }
}

async function handleDelete(id: string) {
  try {
    await deleteHttpTool(id);
    ElMessage.success("Tool deleted");
    loadHttpTools();
    loadTools();
  } catch {
    ElMessage.error("Failed to delete tool");
  }
}

onMounted(() => {
  loadTools();
  loadHttpTools();
});
</script>
