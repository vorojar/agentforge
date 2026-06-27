<!--
  知识库管理页面
  功能：知识库 CRUD、知识源上传管理
  创建时间：2026-03-31
  负责人：王觉贤
-->
<template>
  <div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 16px">
      <h2 style="margin: 0">{{ t("knowledge.title") }}</h2>
      <el-button type="primary" @click="showCreateDialog = true">{{ t("knowledge.create") }}</el-button>
    </div>

    <el-row :gutter="16">
      <el-col v-for="kb in knowledgeBases" :key="kb.id" :span="8" style="margin-bottom: 16px">
        <el-card shadow="hover">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <strong>{{ kb.name }}</strong>
              <div>
                <el-button size="small" type="primary" @click="openKb(kb)">{{ t("common.manage") }}</el-button>
                <el-popconfirm :title="t('knowledge.deleteConfirm')" @confirm="handleDelete(kb.id)">
                  <template #reference>
                    <el-button size="small" type="danger">{{ t("common.delete") }}</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </template>
          <p style="color: #909399; font-size: 13px; margin: 0 0 8px">{{ kb.description || t("common.noDescription") }}</p>
          <p style="margin: 0; font-size: 12px; color: #b0b0b0">
            {{ t("knowledge.sourcesCount", { count: kb.sources?.length ?? 0 }) }} | {{ t("knowledge.createdAt") }} {{ kb.createdAt?.slice(0, 10) }}
          </p>
        </el-card>
      </el-col>
    </el-row>

    <el-empty v-if="knowledgeBases.length === 0" :description="t('knowledge.empty')" />

    <!-- Create Dialog -->
    <el-dialog v-model="showCreateDialog" :title="t('knowledge.create')" width="500px">
      <el-form label-width="100px">
        <el-form-item :label="t('common.name')">
          <el-input v-model="createForm.name" :placeholder="t('knowledge.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('common.description')">
          <el-input v-model="createForm.description" type="textarea" :rows="3" :placeholder="t('knowledge.descriptionPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">{{ t("common.create") }}</el-button>
      </template>
    </el-dialog>

    <!-- Manage Dialog -->
    <el-dialog v-model="showManageDialog" :title="t('knowledge.manageTitle', { name: currentKb?.name || '' })" width="800px" top="5vh">
      <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center">
        <el-input v-model="uploadForm.name" :placeholder="t('knowledge.documentName')" style="width: 200px" />
        <el-upload
          :show-file-list="false"
          :before-upload="handleFileSelect"
          accept=".txt,.md,.csv,.json,.html,.xml"
        >
          <el-button>{{ t("common.selectFile") }}</el-button>
        </el-upload>
        <el-button type="primary" :loading="uploading" :disabled="!uploadForm.name || !uploadForm.content" @click="handleUpload">
          {{ t("common.upload") }}
        </el-button>
        <span v-if="uploadForm.content" style="font-size: 12px; color: #909399">
          {{ (uploadForm.content.length / 1024).toFixed(1) }} KB
        </span>
      </div>

      <el-table :data="currentSources" style="width: 100%" :empty-text="t('knowledge.noDocuments')">
        <el-table-column prop="sourceName" :label="t('common.document')" />
        <el-table-column prop="chunkCount" :label="t('common.chunks')" width="80" align="center" />
        <el-table-column :label="t('common.actions')" width="180" align="center">
          <template #default="{ row }">
            <el-button size="small" @click="viewSource(row.sourceName)">{{ t("common.view") }}</el-button>
            <el-popconfirm :title="t('knowledge.deleteDocumentConfirm')" @confirm="handleDeleteSource(row.sourceName)">
              <template #reference>
                <el-button size="small" type="danger">{{ t("common.delete") }}</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- View Source Dialog -->
    <el-dialog v-model="showViewDialog" :title="t('knowledge.viewSourceTitle', { name: viewingSource })" width="700px" top="5vh">
      <el-input v-model="viewContent" type="textarea" :rows="20" />
      <template #footer>
        <el-button @click="showViewDialog = false">{{ t("common.close") }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveContent">{{ t("common.save") }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { t } from '@/i18n';
import {
  getKnowledgeBases,
  createKnowledgeBase,
  deleteKnowledgeBase,
  getKnowledgeSources,
  uploadKnowledgeSource,
  getKnowledgeContent,
  updateKnowledgeContent,
  deleteKnowledgeSource,
} from '../api';

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  sources?: Array<{ sourceName: string; chunkCount: number }>;
  createdAt: string;
}

const knowledgeBases = ref<KnowledgeBase[]>([]);
const showCreateDialog = ref(false);
const showManageDialog = ref(false);
const showViewDialog = ref(false);
const creating = ref(false);
const uploading = ref(false);
const saving = ref(false);
const createForm = ref({ name: '', description: '' });
const currentKb = ref<KnowledgeBase | null>(null);
const currentSources = ref<Array<{ sourceName: string; chunkCount: number }>>([]);
const uploadForm = ref({ name: '', content: '' });
const viewingSource = ref('');
const viewContent = ref('');

onMounted(loadKbs);

async function loadKbs() {
  const { data } = await getKnowledgeBases();
  knowledgeBases.value = data;
}

async function handleCreate() {
  if (!createForm.value.name) return;
  creating.value = true;
  try {
    await createKnowledgeBase(createForm.value);
    showCreateDialog.value = false;
    createForm.value = { name: '', description: '' };
    ElMessage.success(t('knowledge.created'));
    await loadKbs();
  } finally { creating.value = false; }
}

async function handleDelete(id: string) {
  await deleteKnowledgeBase(id);
  ElMessage.success(t('knowledge.deleted'));
  await loadKbs();
}

async function openKb(kb: KnowledgeBase) {
  currentKb.value = kb;
  uploadForm.value = { name: '', content: '' };
  const { data } = await getKnowledgeSources(kb.id);
  currentSources.value = data;
  showManageDialog.value = true;
}

function handleFileSelect(file: File) {
  if (!uploadForm.value.name) {
    uploadForm.value.name = file.name;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadForm.value.content = e.target?.result as string;
  };
  reader.readAsText(file);
  return false;
}

async function handleUpload() {
  if (!currentKb.value || !uploadForm.value.name || !uploadForm.value.content) return;
  uploading.value = true;
  try {
    await uploadKnowledgeSource(currentKb.value.id, uploadForm.value);
    ElMessage.success(t('knowledge.uploaded'));
    uploadForm.value = { name: '', content: '' };
    const { data } = await getKnowledgeSources(currentKb.value.id);
    currentSources.value = data;
    await loadKbs();
  } finally { uploading.value = false; }
}

async function viewSource(sourceName: string) {
  if (!currentKb.value) return;
  viewingSource.value = sourceName;
  const { data } = await getKnowledgeContent(currentKb.value.id, sourceName);
  viewContent.value = data.content;
  showViewDialog.value = true;
}

async function handleSaveContent() {
  if (!currentKb.value) return;
  saving.value = true;
  try {
    await updateKnowledgeContent(currentKb.value.id, viewingSource.value, viewContent.value);
    ElMessage.success(t('knowledge.saved'));
    showViewDialog.value = false;
    const { data } = await getKnowledgeSources(currentKb.value.id);
    currentSources.value = data;
  } finally { saving.value = false; }
}

async function handleDeleteSource(sourceName: string) {
  if (!currentKb.value) return;
  await deleteKnowledgeSource(currentKb.value.id, sourceName);
  ElMessage.success(t('knowledge.deleted'));
  const { data } = await getKnowledgeSources(currentKb.value.id);
  currentSources.value = data;
  await loadKbs();
}
</script>
