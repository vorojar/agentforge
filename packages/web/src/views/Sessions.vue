<template>
  <div>
    <div class="page-header">
      <span></span>
      <el-select v-model="filterAgent" clearable :placeholder="t('sessions.filterByAgent')" style="width: 200px" @change="onFilterChange">
        <el-option v-for="a in agents" :key="a.id" :label="a.name" :value="a.id" />
      </el-select>
    </div>

    <el-table :data="pagedSessions" v-loading="loading" stripe @row-click="openSession" style="cursor: pointer">
      <el-table-column :label="t('sessions.conversation')" min-width="250">
        <template #default="{ row }">
          <span style="color: #303133">{{ truncate(formatFirstMessage(row.firstMessage), 60) || t("sessions.emptyMessage") }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="agentId" :label="t('common.agent')" min-width="120">
        <template #default="{ row }">
          {{ agentMap[row.agentId] || row.agentId }}
        </template>
      </el-table-column>
      <el-table-column prop="messageCount" :label="t('sessions.messages')" width="100" align="center">
        <template #default="{ row }">
          {{ row.messageCount ?? 0 }}
        </template>
      </el-table-column>
      <el-table-column :label="t('common.tokens')" min-width="200">
        <template #default="{ row }">
          <span>{{ ((row.totalTokensIn ?? 0) + (row.totalTokensOut ?? 0)).toLocaleString() }}</span>
          <span style="color: #909399; font-size: 12px; margin-left: 4px">
            ({{ (row.totalTokensIn ?? 0).toLocaleString() }}↑ {{ (row.totalTokensOut ?? 0).toLocaleString() }}↓)
          </span>
          <span v-if="row.totalCacheRead > 0" style="color: #67c23a; font-size: 12px; margin-left: 4px">
            {{ Math.round(row.totalCacheRead / (row.totalTokensIn || 1) * 100) }}% {{ t("sessions.cache") }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" :label="t('sessions.lastActivity')" min-width="160">
        <template #default="{ row }">
          {{ formatDateTime(row.updatedAt) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="100" align="center">
        <template #default="{ row }">
          <el-popconfirm :title="t('sessions.deleteConfirm')" @confirm.stop="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger" @click.stop>{{ t("common.delete") }}</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <div style="display: flex; justify-content: flex-end; margin-top: 16px" v-if="allSessions.length > pageSize">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="allSessions.length"
        layout="total, prev, pager, next"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getSessions, getAgents, deleteSession } from "@/api";
import { ElMessage } from "element-plus";
import { formatDateTime } from "@/utils/format";
import { t } from "@/i18n";

function formatFirstMessage(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return raw;
    const parts: string[] = [];
    for (const block of parsed) {
      if (block.type === "text" && block.text) parts.push(block.text);
      else if (block.type === "image") parts.push(t("sessions.imagePlaceholder"));
    }
    return parts.join(" ") || t("sessions.imagePlaceholder");
  } catch {
    return raw;
  }
}

function truncate(text: string | undefined, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

const router = useRouter();
const allSessions = ref<Array<Record<string, unknown>>>([]);
const agents = ref<Array<{ id: string; name: string }>>([]);
const agentMap = ref<Record<string, string>>({});
const loading = ref(false);
const filterAgent = ref("");
const currentPage = ref(1);
const pageSize = 20;

const pagedSessions = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return allSessions.value.slice(start, start + pageSize);
});

function onFilterChange() {
  currentPage.value = 1;
  loadSessions();
}

async function loadSessions() {
  loading.value = true;
  try {
    const { data } = await getSessions(filterAgent.value || undefined);
    allSessions.value = data;
  } catch {
    ElMessage.error(t("sessions.failedLoad"));
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
    ElMessage.success(t("sessions.deleted"));
    loadSessions();
  } catch {
    ElMessage.error(t("sessions.failedDelete"));
  }
}

onMounted(() => {
  loadAgents();
  loadSessions();
});
</script>
