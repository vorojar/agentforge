<template>
  <div>
    <div class="page-header">
      <h2>Sessions</h2>
      <el-select v-model="filterAgent" clearable placeholder="Filter by Agent" style="width: 200px" @change="loadSessions">
        <el-option v-for="a in agents" :key="a.id" :label="a.name" :value="a.id" />
      </el-select>
    </div>

    <el-table :data="sessions" v-loading="loading" stripe @row-click="openSession" style="cursor: pointer">
      <el-table-column prop="id" label="Session ID" min-width="200">
        <template #default="{ row }">
          <code style="font-size: 12px">{{ row.id.slice(0, 8) }}...</code>
        </template>
      </el-table-column>
      <el-table-column prop="agentId" label="Agent" min-width="120">
        <template #default="{ row }">
          {{ agentMap[row.agentId] || row.agentId }}
        </template>
      </el-table-column>
      <el-table-column prop="messageCount" label="Messages" width="100" align="center">
        <template #default="{ row }">
          {{ row.messageCount ?? 0 }}
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="Last Activity" min-width="160">
        <template #default="{ row }">
          {{ formatTime(row.updatedAt) }}
        </template>
      </el-table-column>
      <el-table-column label="Actions" width="100" align="center">
        <template #default="{ row }">
          <el-popconfirm title="Delete session?" @confirm.stop="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger" @click.stop>Delete</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getSessions, getAgents, deleteSession } from "@/api";
import { ElMessage } from "element-plus";

const router = useRouter();
const sessions = ref<Array<Record<string, unknown>>>([]);
const agents = ref<Array<{ id: string; name: string }>>([]);
const agentMap = ref<Record<string, string>>({});
const loading = ref(false);
const filterAgent = ref("");

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function loadSessions() {
  loading.value = true;
  try {
    const { data } = await getSessions(filterAgent.value || undefined);
    sessions.value = data;
  } catch {
    ElMessage.error("Failed to load sessions");
  } finally {
    loading.value = false;
  }
}

async function loadAgents() {
  try {
    const { data } = await getAgents();
    agents.value = data;
    agentMap.value = Object.fromEntries(data.map((a: { id: string; name: string }) => [a.id, a.name]));
  } catch {
    // ignore
  }
}

function openSession(row: Record<string, unknown>) {
  router.push(`/sessions/${row.id}`);
}

async function handleDelete(id: string) {
  try {
    await deleteSession(id);
    ElMessage.success("Session deleted");
    loadSessions();
  } catch {
    ElMessage.error("Failed to delete session");
  }
}

onMounted(() => {
  loadAgents();
  loadSessions();
});
</script>
