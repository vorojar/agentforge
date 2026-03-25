<template>
  <div>
    <div class="page-header">
      <h2>Skills</h2>
      <el-text type="info" size="small">
        Skills are loaded from the <code>skills/</code> directory (Claude Code convention)
      </el-text>
    </div>

    <el-table :data="skills" v-loading="loading" stripe>
      <el-table-column prop="name" label="Name" width="200" />
      <el-table-column prop="description" label="Description" />
      <el-table-column label="Actions" width="120" align="center">
        <template #default="{ row }">
          <el-button link type="primary" @click="viewSkill(row)">View</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="selectedSkill?.name" width="700px">
      <pre style="background: #f5f7fa; padding: 16px; border-radius: 4px; overflow: auto; font-size: 13px; white-space: pre-wrap; max-height: 500px">{{ selectedSkill?.content }}</pre>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getSkills } from "@/api";
import { ElMessage } from "element-plus";

interface SkillItem {
  id: string;
  name: string;
  description: string;
  content: string;
}

const skills = ref<SkillItem[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const selectedSkill = ref<SkillItem | null>(null);

async function loadSkills() {
  loading.value = true;
  try {
    const { data } = await getSkills();
    skills.value = data;
  } catch {
    ElMessage.error("Failed to load skills");
  } finally {
    loading.value = false;
  }
}

function viewSkill(skill: SkillItem) {
  selectedSkill.value = skill;
  dialogVisible.value = true;
}

onMounted(loadSkills);
</script>
