<template>
  <div>
    <div class="page-header">
      <span></span>
      <el-button type="primary" @click="$router.push('/agents/new')">
        <el-icon><Plus /></el-icon> Create Agent
      </el-button>
    </div>

    <el-table :data="agents" v-loading="loading" stripe>
      <el-table-column prop="name" label="Name" min-width="150" />
      <el-table-column prop="model" label="Model" width="240" />
      <el-table-column label="Streaming" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.streaming ? 'success' : 'info'" size="small">
            {{ row.streaming ? "ON" : "OFF" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Status" width="100" align="center">
        <template #default="{ row }">
          <el-switch
            v-model="row.enabled"
            @change="toggleAgent(row)"
          />
        </template>
      </el-table-column>
      <el-table-column label="API Key" width="200">
        <template #default="{ row }">
          <code style="font-size: 12px; color: #909399">{{ row.apiKeyPrefix || "—" }}...</code>
          <el-button link size="small" @click="copyKey(row)" v-if="row.rawKey">
            <el-icon><CopyDocument /></el-icon>
          </el-button>
        </template>
      </el-table-column>
      <el-table-column label="Actions" width="180" align="center">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/agents/${row.id}/edit`)">Edit</el-button>
          <el-popconfirm title="Delete this agent?" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger">Delete</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Plus, CopyDocument } from "@element-plus/icons-vue";
import { getAgents, updateAgent, deleteAgent } from "@/api";
import { ElMessage } from "element-plus";

interface Agent {
  id: string;
  name: string;
  model: string;
  streaming: boolean;
  enabled: boolean;
  apiKeyPrefix?: string;
  rawKey?: string;
}

const agents = ref<Agent[]>([]);
const loading = ref(false);

async function loadAgents() {
  loading.value = true;
  try {
    const { data } = await getAgents();
    agents.value = data;
  } catch {
    ElMessage.error("Failed to load agents");
  } finally {
    loading.value = false;
  }
}

async function toggleAgent(row: Agent) {
  try {
    await updateAgent(row.id, { enabled: row.enabled });
    ElMessage.success(`Agent ${row.enabled ? "enabled" : "disabled"}`);
  } catch {
    ElMessage.error("Failed to update agent");
  }
}

async function handleDelete(id: string) {
  try {
    await deleteAgent(id);
    ElMessage.success("Agent deleted");
    loadAgents();
  } catch {
    ElMessage.error("Failed to delete agent");
  }
}

function copyKey(row: Agent) {
  if (row.rawKey) {
    navigator.clipboard.writeText(row.rawKey);
    ElMessage.success("API key copied");
  }
}

onMounted(loadAgents);
</script>
