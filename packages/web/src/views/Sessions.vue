<template>
  <div>
    <div class="page-header">
      <span></span>
      <el-select v-model="filterAgent" clearable placeholder="Filter by Agent" style="width: 200px" @change="onFilterChange">
        <el-option v-for="a in agents" :key="a.id" :label="a.name" :value="a.id" />
      </el-select>
    </div>

    <el-table :data="sessions" v-loading="loading" stripe @row-click="openSession" style="cursor: pointer">
      <el-table-column label="Conversation" min-width="250">
        <template #default="{ row }">
          <span style="color: #303133">{{ extractPreview(row.firstMessage) }}</span>
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
      <el-table-column label="Tokens" min-width="200">
        <template #default="{ row }">
          <span>{{ ((row.totalTokensIn ?? 0) + (row.totalTokensOut ?? 0)).toLocaleString() }}</span>
          <span style="color: #909399; font-size: 12px; margin-left: 4px">
            ({{ (row.totalTokensIn ?? 0).toLocaleString() }}↑ {{ (row.totalTokensOut ?? 0).toLocaleString() }}↓)
          </span>
          <span v-if="row.totalCacheRead > 0" style="color: #67c23a; font-size: 12px; margin-left: 4px">
            {{ Math.round(row.totalCacheRead / (row.totalTokensIn || 1) * 100) }}% cache
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="Last Activity" min-width="160">
        <template #default="{ row }">
          {{ formatDateTime(row.updatedAt) }}
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

    <div style="display: flex; justify-content: flex-end; margin-top: 16px" v-if="sessions.length >= pageSize">
      <el-button @click="loadMore" :loading="loading">Load More</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getSessions, getAgents, deleteSession } from "@/api";
import { ElMessage } from "element-plus";
import { formatDateTime } from "@/utils/format";

function extractPreview(raw: string | undefined): string {
  if (!raw) return "(empty)";
  // Try parsing as JSON array (image + text blocks)
  if (raw.startsWith("[")) {
    try {
      const blocks = JSON.parse(raw) as Array<{ type: string; text?: string }>;
      const hasImage = blocks.some(b => b.type === "image");
      const text = blocks.filter(b => b.type === "text").map(b => b.text).join(" ");
      const preview = text || "(image)";
      return (hasImage ? "📷 " : "") + (preview.length > 60 ? preview.slice(0, 60) + "..." : preview);
    } catch { /* not JSON */ }
  }
  return raw.length > 60 ? raw.slice(0, 60) + "..." : raw;
}

const router = useRouter();
const sessions = ref<Array<Record<string, unknown>>>([]);
const agents = ref<Array<{ id: string; name: string }>>([]);
const agentMap = ref<Record<string, string>>({});
const loading = ref(false);
const filterAgent = ref("");
const pageSize = 20;

function onFilterChange() {
  sessions.value = [];
  loadSessions();
}

async function loadSessions() {
  loading.value = true;
  try {
    const { data } = await getSessions(filterAgent.value || undefined, pageSize, 0);
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

async function loadMore() {
  loading.value = true;
  try {
    const { data } = await getSessions(filterAgent.value || undefined, pageSize, sessions.value.length);
    sessions.value.push(...data);
  } catch {
    ElMessage.error("Failed to load more");
  } finally {
    loading.value = false;
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
