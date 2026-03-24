<template>
  <div>
    <div class="page-header">
      <h2>Tool Registry</h2>
    </div>

    <el-table :data="tools" v-loading="loading" stripe>
      <el-table-column prop="name" label="Name" width="200" />
      <el-table-column prop="description" label="Description" />
      <el-table-column label="Parameters" width="120" align="center">
        <template #default="{ row }">
          <el-button link type="primary" @click="showSchema(row)">
            View Schema
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="`${selectedTool?.name} — Parameters`" width="600px">
      <pre style="background: #f5f7fa; padding: 16px; border-radius: 4px; overflow: auto; font-size: 13px">{{ schemaJson }}</pre>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getTools } from "@/api";
import { ElMessage } from "element-plus";

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const tools = ref<ToolDef[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const selectedTool = ref<ToolDef | null>(null);
const schemaJson = ref("");

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

function showSchema(tool: ToolDef) {
  selectedTool.value = tool;
  schemaJson.value = JSON.stringify(tool.parameters, null, 2);
  dialogVisible.value = true;
}

onMounted(loadTools);
</script>
