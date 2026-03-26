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
    <div v-else class="editor-root">
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

      <div class="editor-layout">
        <!-- File tree (left) -->
        <div class="file-tree">
          <div v-for="file in fileTree" :key="file.path"
            :style="{ paddingLeft: (file.depth * 16 + 8) + 'px' }"
            :class="['file-item', { active: currentFile?.path === file.path, directory: file.type === 'directory' }]"
            @click="handleFileClick(file)">
            <span>{{ file.type === 'directory' ? '📁' : '📄' }} {{ file.name }}</span>
            <el-button v-if="file.type === 'file' && file.path !== 'SKILL.md'" link type="danger" size="small"
              @click.stop="deleteFile(file.path)" class="delete-btn">×</el-button>
          </div>
        </div>

        <!-- Editor (right) -->
        <div class="editor-pane">
          <div v-if="currentFile" class="editor-content">
            <div class="editor-path">{{ currentFile.path }}</div>
            <textarea v-model="currentFile.content" class="code-editor" spellcheck="false"></textarea>
          </div>
          <div v-else class="editor-empty">
            Select a file to edit
          </div>
        </div>
      </div>

      <!-- New file dialog -->
      <el-dialog v-model="showNewFileDialog" title="New File" width="450px">
        <el-form label-width="80px">
          <el-form-item label="Directory">
            <el-select v-model="newFileDir" style="width: 100%">
              <el-option label="/ (root)" value="" />
              <el-option label="examples/" value="examples" />
              <el-option label="references/" value="references" />
            </el-select>
          </el-form-item>
          <el-form-item label="Filename">
            <el-input v-model="newFileName" placeholder="e.g. my-doc.md">
              <template #append>.md</template>
            </el-input>
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
const newFileDir = ref("");
const newFileName = ref("");

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
  if (fileTree.value.some(f => f.path === "SKILL.md")) {
    await openFile("SKILL.md");
  }
}

function closeEditor() {
  editingSkill.value = null;
  currentFile.value = null;
  loadSkills();
}

async function loadFileTree() {
  if (!editingSkill.value) return;
  try {
    const { data } = await getSkillFiles(editingSkill.value.id);
    const nodes: FileNode[] = [];
    const dirs = new Set<string>();
    for (const f of data as Array<{ path: string; type: string }>) {
      const parts = f.path.split("/");
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

function handleFileClick(file: FileNode) {
  if (file.type === "file") {
    openFile(file.path);
  } else {
    // Click directory → open new file dialog pre-filled with this dir
    newFileDir.value = file.path;
    newFileName.value = "";
    showNewFileDialog.value = true;
  }
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
  } catch { /* cancelled */ }
}

async function createFile() {
  if (!editingSkill.value || !newFileName.value) return;
  const name = newFileName.value.replace(/\.md$/, "") + ".md";
  const path = newFileDir.value ? `${newFileDir.value}/${name}` : name;
  try {
    await saveSkillFile(editingSkill.value.id, path, "");
    showNewFileDialog.value = false;
    newFileName.value = "";
    newFileDir.value = "";
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
.editor-root {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.editor-layout {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
  height: calc(100vh - 180px);
}
.file-tree {
  width: 250px;
  flex-shrink: 0;
  overflow-y: auto;
  background: #fff;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
  padding: 8px 0;
}
.file-item {
  display: flex;
  align-items: center;
  padding: 7px 12px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
.file-item:hover {
  background: #f5f7fa;
}
.file-item.active {
  background: #ecf5ff;
  color: #409eff;
}
.file-item.directory {
  color: #e6a23c;
  font-weight: 500;
}
.delete-btn {
  margin-left: auto;
  opacity: 0;
}
.file-item:hover .delete-btn {
  opacity: 1;
}
.editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
}
.editor-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px;
  min-height: 0;
}
.editor-path {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
}
.code-editor {
  flex: 1;
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 12px;
  font-family: "SF Mono", "Fira Code", Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline: none;
  color: #303133;
  background: #fafafa;
}
.code-editor:focus {
  border-color: #409eff;
  background: #fff;
}
.editor-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
}
</style>
