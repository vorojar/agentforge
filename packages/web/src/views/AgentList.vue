<template>
  <div>
    <div class="page-header">
      <el-select v-model="selectedCategory" :placeholder="t('common.allCategories')" clearable style="width: 220px">
        <el-option v-for="category in categories" :key="category" :label="category" :value="category" />
      </el-select>
      <el-button type="primary" @click="$router.push('/agents/new')">
        <el-icon><Plus /></el-icon> {{ t("agents.createAgent") }}
      </el-button>
    </div>

    <el-table :data="filteredAgents" v-loading="loading" stripe>
      <el-table-column prop="name" :label="t('common.name')" min-width="150" />
      <el-table-column :label="t('common.category')" width="140">
        <template #default="{ row }">
          <el-tag v-if="row.category" size="small">{{ row.category }}</el-tag>
          <span v-else style="color: #c0c4cc">{{ t("common.uncategorized") }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="providerName" :label="t('common.model')" width="200" show-overflow-tooltip />
      <el-table-column :label="t('cap.streaming')" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.streaming ? 'success' : 'info'" size="small">
            {{ row.streaming ? t("common.on") : t("common.off") }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="100" align="center">
        <template #default="{ row }">
          <el-switch
            v-model="row.enabled"
            @change="toggleAgent(row)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('agents.apiKey')" width="200">
        <template #default="{ row }">
          <code style="font-size: 12px; color: #909399">{{ row.apiKeyPrefix || "—" }}...</code>
          <el-button link size="small" @click="copyKey(row)" v-if="row.rawKey">
            <el-icon><CopyDocument /></el-icon>
          </el-button>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="180" align="center">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/agents/${row.id}/edit`)">{{ t("common.edit") }}</el-button>
          <el-popconfirm :title="t('agents.deleteConfirm')" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger">{{ t("common.delete") }}</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { Plus, CopyDocument } from "@element-plus/icons-vue";
import { getAgents, updateAgent, deleteAgent } from "@/api";
import { ElMessage } from "element-plus";
import { t } from "@/i18n";

interface Agent {
  id: string;
  name: string;
  category?: string;
  model: string;
  streaming: boolean;
  enabled: boolean;
  apiKeyPrefix?: string;
  rawKey?: string;
}

const agents = ref<Agent[]>([]);
const loading = ref(false);
const selectedCategory = ref("");
function normalizedCategory(agent: Agent): string {
  return agent.category?.trim() ?? "";
}
const categories = computed(() => {
  return [...new Set(agents.value.map(normalizedCategory).filter(Boolean))].sort();
});
const filteredAgents = computed(() => {
  if (!selectedCategory.value) return agents.value;
  return agents.value.filter(agent => normalizedCategory(agent) === selectedCategory.value);
});

async function loadAgents() {
  loading.value = true;
  try {
    const { data } = await getAgents();
    agents.value = data;
  } catch {
    ElMessage.error(t("agents.failedLoad"));
  } finally {
    loading.value = false;
  }
}

async function toggleAgent(row: Agent) {
  try {
    await updateAgent(row.id, { enabled: row.enabled });
    ElMessage.success(row.enabled ? t("agents.enabled") : t("agents.disabled"));
  } catch {
    ElMessage.error(t("agents.failedUpdate"));
  }
}

async function handleDelete(id: string) {
  try {
    await deleteAgent(id);
    ElMessage.success(t("agents.deleted"));
    loadAgents();
  } catch {
    ElMessage.error(t("agents.failedDelete"));
  }
}

function copyKey(row: Agent) {
  if (row.rawKey) {
    navigator.clipboard.writeText(row.rawKey);
    ElMessage.success(t("common.copied"));
  }
}

onMounted(loadAgents);
</script>
