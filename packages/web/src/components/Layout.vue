<template>
  <el-container style="height: 100%">
    <el-aside width="220px" style="background: #1d1e2c">
      <div class="logo">
        <span class="logo-icon">⚡</span>
        <span class="logo-text">AgentForge</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        background-color="#1d1e2c"
        text-color="#a3a6ad"
        active-text-color="#409eff"
        router
        style="border-right: none"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>Dashboard</span>
        </el-menu-item>
        <el-menu-item index="/agents">
          <el-icon><User /></el-icon>
          <span>Agents</span>
        </el-menu-item>
        <el-menu-item index="/providers">
          <el-icon><Connection /></el-icon>
          <span>Providers</span>
        </el-menu-item>
        <el-menu-item index="/tools">
          <el-icon><SetUp /></el-icon>
          <span>Tools</span>
        </el-menu-item>
        <el-menu-item index="/skills">
          <el-icon><MagicStick /></el-icon>
          <span>Skills</span>
        </el-menu-item>
        <el-menu-item index="/sessions">
          <el-icon><ChatDotSquare /></el-icon>
          <span>Sessions</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header style="background: #fff; border-bottom: 1px solid #e4e7ed; display: flex; align-items: center; justify-content: space-between">
        <h1 style="font-size: 16px; color: #303133">{{ pageTitle }}</h1>
        <el-button size="small" @click="showSettings = true">
          <el-icon><Setting /></el-icon>
        </el-button>
      </el-header>
      <el-main style="background: #f5f7fa; overflow-y: auto">
        <router-view />
      </el-main>
    </el-container>

    <el-dialog v-model="showSettings" title="Settings" width="400px">
      <el-form label-width="120px">
        <el-form-item label="Admin Secret">
          <el-input
            v-model="adminSecret"
            type="password"
            show-password
            placeholder="Enter admin secret"
            @change="saveSecret"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="danger" @click="clearSecret">Logout</el-button>
        <el-button @click="showSettings = false">Close</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import {
  DataAnalysis,
  User,
  Connection,
  SetUp,
  MagicStick,
  ChatDotSquare,
  Setting,
} from "@element-plus/icons-vue";

const route = useRoute();
const showSettings = ref(false);
const adminSecret = ref(localStorage.getItem("adminSecret") || "");

const activeMenu = computed(() => {
  const path = route.path;
  if (path.startsWith("/agents")) return "/agents";
  if (path.startsWith("/sessions")) return "/sessions";
  return path;
});

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/agents": "Agent Management",
  "/providers": "Provider Management",
  "/tools": "Tool Registry",
  "/skills": "Skill Management",
  "/sessions": "Conversation History",
};

const pageTitle = computed(() => {
  for (const [prefix, title] of Object.entries(pageTitles)) {
    if (route.path.startsWith(prefix)) return title;
  }
  return "AgentForge";
});

function saveSecret() {
  localStorage.setItem("adminSecret", adminSecret.value);
}

function clearSecret() {
  localStorage.removeItem("adminSecret");
  showSettings.value = false;
  window.location.reload();
}
</script>

<style scoped>
.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.logo-icon {
  font-size: 22px;
}
.logo-text {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 1px;
}
</style>
