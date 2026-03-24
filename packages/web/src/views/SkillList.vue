<template>
  <div>
    <div class="page-header">
      <h2>Skills</h2>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon> Create Skill
      </el-button>
    </div>

    <el-table :data="skills" v-loading="loading" stripe>
      <el-table-column prop="name" label="Name" width="200" />
      <el-table-column prop="description" label="Description" />
      <el-table-column label="Status" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? "Enabled" : "Disabled" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Actions" width="180" align="center">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">Edit</el-button>
          <el-popconfirm title="Delete this skill?" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger">Delete</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingSkill ? 'Edit Skill' : 'Create Skill'" width="700px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="Name" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="Description">
          <el-input v-model="form.description" />
        </el-form-item>
        <el-form-item label="Content" required>
          <el-input v-model="form.content" type="textarea" :rows="15" placeholder="Markdown skill content..." />
        </el-form-item>
        <el-form-item label="Enabled">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">Cancel</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">Save</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Plus } from "@element-plus/icons-vue";
import { getSkills, createSkill, updateSkill, deleteSkill } from "@/api";
import { ElMessage } from "element-plus";

interface SkillItem {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
}

const skills = ref<SkillItem[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const editingSkill = ref<SkillItem | null>(null);
const form = ref({ name: "", description: "", content: "", enabled: true });

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

function openCreate() {
  editingSkill.value = null;
  form.value = { name: "", description: "", content: "", enabled: true };
  dialogVisible.value = true;
}

function openEdit(skill: SkillItem) {
  editingSkill.value = skill;
  form.value = { ...skill };
  dialogVisible.value = true;
}

async function handleSave() {
  if (!form.value.name || !form.value.content) {
    ElMessage.warning("Name and Content are required");
    return;
  }
  saving.value = true;
  try {
    if (editingSkill.value) {
      await updateSkill(editingSkill.value.id, form.value);
    } else {
      await createSkill(form.value);
    }
    ElMessage.success("Skill saved");
    dialogVisible.value = false;
    loadSkills();
  } catch {
    ElMessage.error("Failed to save skill");
  } finally {
    saving.value = false;
  }
}

async function handleDelete(id: string) {
  try {
    await deleteSkill(id);
    ElMessage.success("Skill deleted");
    loadSkills();
  } catch {
    ElMessage.error("Failed to delete skill");
  }
}

onMounted(loadSkills);
</script>
