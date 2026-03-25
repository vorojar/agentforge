<template>
  <div>
    <div class="page-header">
      <h2>{{ isEdit ? "Edit Agent" : "Create Agent" }}</h2>
    </div>

    <el-card v-loading="loading">
      <el-form :model="form" label-width="140px" style="max-width: 700px">
        <el-form-item label="Name" required>
          <el-input v-model="form.name" placeholder="Agent name" />
        </el-form-item>

        <el-form-item label="Description">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>

        <el-form-item label="System Prompt" required>
          <el-input
            v-model="form.systemPrompt"
            type="textarea"
            :rows="8"
            placeholder="Define the agent's role and behavior..."
          />
        </el-form-item>

        <el-form-item label="Model">
          <el-select v-model="form.model" style="width: 100%">
            <el-option label="Claude Sonnet 4" value="claude-sonnet-4-20250514" />
            <el-option label="Claude Opus 4" value="claude-opus-4-20250514" />
            <el-option label="Claude Haiku 3.5" value="claude-haiku-3-5-20241022" />
            <el-option label="GPT-4o" value="gpt-4o" />
            <el-option label="GPT-4o Mini" value="gpt-4o-mini" />
          </el-select>
        </el-form-item>

        <el-form-item label="Temperature">
          <el-slider v-model="form.temperature" :min="0" :max="1" :step="0.1" show-input />
        </el-form-item>

        <el-form-item label="Max Tokens">
          <el-input-number v-model="form.maxTokens" :min="256" :max="32768" :step="256" />
        </el-form-item>

        <el-form-item label="Max Iterations">
          <el-input-number v-model="form.maxIterations" :min="1" :max="50" />
        </el-form-item>

        <el-form-item label="Streaming">
          <el-switch v-model="form.streaming" />
        </el-form-item>

        <el-form-item label="Tools">
          <el-select v-model="form.tools" multiple style="width: 100%" placeholder="Select tools">
            <el-option
              v-for="tool in availableTools"
              :key="tool.name"
              :label="tool.name"
              :value="tool.name"
            >
              <span>{{ tool.name }}</span>
              <span style="color: #909399; font-size: 12px; margin-left: 8px">{{ tool.description }}</span>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="Skills">
          <el-select v-model="form.skills" multiple style="width: 100%" placeholder="Select skills">
            <el-option
              v-for="skill in availableSkills"
              :key="skill.name"
              :label="skill.name"
              :value="skill.name"
            />
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSave" :loading="saving">Save</el-button>
          <el-button @click="$router.back()">Cancel</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getAgent, createAgent, updateAgent, getTools, getSkills, getStats } from "@/api";
import { ElMessage } from "element-plus";

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => !!route.params.id);
const loading = ref(false);
const saving = ref(false);

const form = ref({
  name: "",
  description: "",
  systemPrompt: "",
  model: "claude-sonnet-4-20250514",
  temperature: 0.7,
  maxTokens: 4096,
  maxIterations: 15,
  streaming: false,
  tools: [] as string[],
  skills: [] as string[],
});

const availableTools = ref<Array<{ name: string; description: string }>>([]);
const availableSkills = ref<Array<{ name: string }>>([]);

async function loadData() {
  loading.value = true;
  try {
    const [toolsRes, skillsRes, statsRes] = await Promise.all([
      getTools().catch(() => ({ data: [] })),
      getSkills().catch(() => ({ data: [] })),
      getStats().catch(() => ({ data: {} })),
    ]);
    availableTools.value = toolsRes.data;
    availableSkills.value = skillsRes.data;

    if (statsRes.data.defaultModel && !isEdit.value) {
      form.value.model = statsRes.data.defaultModel;
    }

    if (isEdit.value) {
      const { data } = await getAgent(route.params.id as string);
      Object.assign(form.value, data);
    }
  } catch {
    ElMessage.error("Failed to load data");
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  if (!form.value.name || !form.value.systemPrompt) {
    ElMessage.warning("Name and System Prompt are required");
    return;
  }
  saving.value = true;
  try {
    if (isEdit.value) {
      await updateAgent(route.params.id as string, form.value);
      ElMessage.success("Agent updated");
    } else {
      await createAgent(form.value);
      ElMessage.success("Agent created");
    }
    router.push("/agents");
  } catch {
    ElMessage.error("Failed to save agent");
  } finally {
    saving.value = false;
  }
}

onMounted(loadData);
</script>
