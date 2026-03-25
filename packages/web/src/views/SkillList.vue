<template>
  <div>
    <div class="page-header">
      <h2>Skills</h2>
      <div>
        <el-button @click="handleReload" :loading="reloading" size="small">Reload</el-button>
        <el-upload
          :auto-upload="true"
          :show-file-list="false"
          accept=".zip"
          :before-upload="handleImport"
          style="display: inline-block; margin-left: 8px"
        >
          <el-button type="primary">Import Skill (.zip)</el-button>
        </el-upload>
      </div>
    </div>

    <el-text type="info" size="small" style="display: block; margin-bottom: 16px">
      Skills are loaded from the <code>skills/</code> directory. Each skill is a subdirectory with a <code>SKILL.md</code> entry point.
    </el-text>

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
import { getSkills, importSkill, reloadSkills } from "@/api";
import { ElMessage } from "element-plus";
import type { UploadRawFile } from "element-plus";

interface SkillItem {
  id: string;
  name: string;
  description: string;
  content: string;
}

const skills = ref<SkillItem[]>([]);
const loading = ref(false);
const reloading = ref(false);
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

async function handleImport(file: UploadRawFile) {
  try {
    const { data } = await importSkill(file);
    ElMessage.success(`Imported skills: ${data.imported.join(", ")}`);
    loadSkills();
  } catch {
    ElMessage.error("Failed to import skill");
  }
  return false; // prevent default upload
}

async function handleReload() {
  reloading.value = true;
  try {
    const { data } = await reloadSkills();
    ElMessage.success(`Reloaded ${data.reloaded} skills`);
    loadSkills();
  } catch {
    ElMessage.error("Failed to reload skills");
  } finally {
    reloading.value = false;
  }
}

onMounted(loadSkills);
</script>
