<template>
  <div>
    <!-- List View -->
    <div v-if="!editingSkill">
      <div class="page-header">
        <h2>Skills</h2>
        <div style="display: flex; gap: 8px">
          <el-button @click="reloadAllSkills">Reload</el-button>
          <el-button type="primary" @click="showCreateDialog = true">Create Skill</el-button>
        </div>
      </div>

      <el-row :gutter="16">
        <el-col :span="8" v-for="skill in skills" :key="skill.id" style="margin-bottom: 16px">
          <el-card shadow="hover">
            <template #header>
              <div style="display: flex; justify-content: space-between; align-items: center">
                <span style="font-weight: 600">{{ skill.name }}</span>
                <el-tag size="small" type="success">Active</el-tag>
              </div>
            </template>
            <p style="font-size: 13px; color: #606266; margin-bottom: 12px; min-height: 36px">{{ skill.description }}</p>
            <el-button size="small" type="primary" @click="openEditor(skill)">Edit</el-button>
          </el-card>
        </el-col>
      </el-row>

      <!-- Create dialog -->
      <el-dialog v-model="showCreateDialog" title="Create New Skill" width="450px">
        <el-form label-width="100px">
          <el-form-item label="Name" required>
            <el-input v-model="newSkillName" placeholder="e.g. customer-faq (lowercase, hyphens)" />
          </el-form-item>
          <el-form-item label="Description">
            <el-input v-model="newSkillDesc" placeholder="What this skill does" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showCreateDialog = false">Cancel</el-button>
          <el-button type="primary" @click="createSkill" :loading="creating">Create</el-button>
        </template>
      </el-dialog>
    </div>

    <!-- Editor View -->
    <div v-else>
      <div class="page-header">
        <h2>
          <el-button link @click="closeEditor" style="font-size: 16px; margin-right: 8px">← Back</el-button>
          {{ editingSkill.name }}
        </h2>
        <div style="display: flex; gap: 8px">
          <el-button @click="showNewFileDialog = true">New File</el-button>
          <el-button type="primary" @click="saveCurrentFile" :loading="saving" :disabled="!currentFile">Save</el-button>
        </div>
      </div>

      <div style="display: flex; gap: 16px; height: calc(100vh - 180px)">
        <!-- File tree (left) -->
        <el-card style="width: 250px; flex-shrink: 0; overflow-y: auto">
          <div v-for="file in fileTree" :key="file.path"
            :style="{ paddingLeft: (file.depth * 16) + 'px', cursor: file.type === 'file' ? 'pointer' : 'default' }"
            :class="['file-item', { active: currentFile?.path === file.path }]"
            @click="file.type === 'file' && openFile(file.path)">
            <span>{{ file.type === 'directory' ? '📁' : '📄' }} {{ file.name }}</span>
            <el-button v-if="file.type === 'file' && file.path !== 'SKILL.md'" link type="danger" size="small"
              @click.stop="deleteFile(file.path)" style="margin-left: auto">×</el-button>
          </div>
        </el-card>

        <!-- Editor (right) -->
        <el-card style="flex: 1; display: flex; flex-direction: column">
          <div v-if="currentFile" style="flex: 1; display: flex; flex-direction: column">
            <div style="font-size: 13px; color: #909399; margin-bottom: 8px">{{ currentFile.path }}</div>
            <el-input v-model="currentFile.content" type="textarea"
              style="flex: 1"
              :autosize="false"
              :input-style="{ height: '100%', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6' }" />
          </div>
          <div v-else style="display: flex; align-items: center; justify-content: center; height: 100%; color: #909399">
            Select a file to edit
          </div>
        </el-card>
      </div>

      <!-- New file dialog -->
      <el-dialog v-model="showNewFileDialog" title="New File" width="400px">
        <el-form label-width="80px">
          <el-form-item label="Path">
            <el-input v-model="newFilePath" placeholder="e.g. template.md, examples/faq.md, references/api.md" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showNewFileDialog = false">Cancel</el-button>
          <el-button type="primary" @click="createFile">Create</el-button>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getSkills, reloadSkills, getSkillFiles, getSkillFile, saveSkillFile, deleteSkillFile, createSkillApi } from "@/api";
import { ElMessage, ElMessageBox } from "element-plus";

interface SkillItem { id: string; name: string; description: string }
interface FileNode { path: string; name: string; type: "file" | "directory"; depth: number }

const skills = ref<SkillItem[]>([]);
const editingSkill = ref<SkillItem | null>(null);
const fileTree = ref<FileNode[]>([]);
const currentFile = ref<{ path: string; content: string } | null>(null);
const saving = ref(false);
const creating = ref(false);
const showCreateDialog = ref(false);
const showNewFileDialog = ref(false);
const newSkillName = ref("");
const newSkillDesc = ref("");
const newFilePath = ref("");

async function loadSkills() {
  try {
    const { data } = await getSkills();
    skills.value = data;
  } catch { ElMessage.error("Failed to load skills"); }
}

async function reloadAllSkills() {
  try {
    await reloadSkills();
    await loadSkills();
    ElMessage.success("Skills reloaded");
  } catch { ElMessage.error("Failed to reload"); }
}

async function openEditor(skill: SkillItem) {
  editingSkill.value = skill;
  currentFile.value = null;
  await loadFileTree();
  // Auto-open SKILL.md
  if (fileTree.value.some(f => f.path === "SKILL.md")) {
    await openFile("SKILL.md");
  }
}

function closeEditor() {
  editingSkill.value = null;
  currentFile.value = null;
  loadSkills(); // refresh in case names changed
}

async function loadFileTree() {
  if (!editingSkill.value) return;
  try {
    const { data } = await getSkillFiles(editingSkill.value.id);
    // Build flat tree with depth
    const nodes: FileNode[] = [];
    const dirs = new Set<string>();
    for (const f of data as Array<{ path: string; type: string }>) {
      const parts = f.path.split("/");
      // Add parent directories
      for (let i = 0; i < parts.length - 1; i++) {
        const dirPath = parts.slice(0, i + 1).join("/");
        if (!dirs.has(dirPath)) {
          dirs.add(dirPath);
          nodes.push({ path: dirPath, name: parts[i], type: "directory", depth: i });
        }
      }
      if (f.type === "file") {
        nodes.push({ path: f.path, name: parts[parts.length - 1], type: "file", depth: parts.length - 1 });
      }
    }
    fileTree.value = nodes;
  } catch { ElMessage.error("Failed to load files"); }
}

async function openFile(path: string) {
  if (!editingSkill.value) return;
  try {
    const { data } = await getSkillFile(editingSkill.value.id, path);
    currentFile.value = { path: data.path, content: data.content };
  } catch { ElMessage.error("Failed to open file"); }
}

async function saveCurrentFile() {
  if (!editingSkill.value || !currentFile.value) return;
  saving.value = true;
  try {
    await saveSkillFile(editingSkill.value.id, currentFile.value.path, currentFile.value.content);
    ElMessage.success("Saved");
  } catch { ElMessage.error("Failed to save"); }
  finally { saving.value = false; }
}

async function deleteFile(path: string) {
  if (!editingSkill.value) return;
  try {
    await ElMessageBox.confirm(`Delete ${path}?`, "Confirm");
    await deleteSkillFile(editingSkill.value.id, path);
    ElMessage.success("Deleted");
    if (currentFile.value?.path === path) currentFile.value = null;
    await loadFileTree();
  } catch { /* cancelled or error */ }
}

async function createFile() {
  if (!editingSkill.value || !newFilePath.value) return;
  const path = newFilePath.value.endsWith(".md") ? newFilePath.value : newFilePath.value + ".md";
  try {
    await saveSkillFile(editingSkill.value.id, path, "");
    showNewFileDialog.value = false;
    newFilePath.value = "";
    await loadFileTree();
    await openFile(path);
    ElMessage.success("File created");
  } catch { ElMessage.error("Failed to create file"); }
}

async function createSkill() {
  if (!newSkillName.value) { ElMessage.warning("Name is required"); return; }
  creating.value = true;
  try {
    await createSkillApi({ name: newSkillName.value, description: newSkillDesc.value });
    showCreateDialog.value = false;
    newSkillName.value = "";
    newSkillDesc.value = "";
    await reloadAllSkills();
    ElMessage.success("Skill created");
  } catch { ElMessage.error("Failed to create skill"); }
  finally { creating.value = false; }
}

onMounted(loadSkills);
</script>

<style scoped>
.file-item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 13px;
  user-select: none;
}
.file-item:hover {
  background: #f5f7fa;
}
.file-item.active {
  background: #ecf5ff;
  color: #409eff;
}
</style>
