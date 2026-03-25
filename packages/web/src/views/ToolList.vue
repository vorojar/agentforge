<template>
  <div>
    <div class="page-header">
      <h2>Tool Registry</h2>
      <el-button type="primary" @click="openCreate">Add HTTP API Tool</el-button>
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
    <h3 style="margin-bottom: 16px">HTTP API Tools</h3>
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
      <el-table-column label="Actions" width="160" align="center">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">Edit</el-button>
          <el-popconfirm title="Delete this tool?" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger">Delete</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

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
import { ref, onMounted } from "vue";
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

const tools = ref<ToolDef[]>([]);
const httpTools = ref<HttpToolItem[]>([]);
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

async function loadTools() {
  loading.value = true;
  try {
    const { data } = await getTools();
    tools.value = data;
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
    ElMessage.success("Tool saved. Restart server to activate.");
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
