<template>
  <el-container class="app-shell">
    <el-aside class="app-sidebar" width="230px">
      <div class="logo">
        <span class="logo-icon">⚡</span>
        <span class="logo-text">AgentForge</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        background-color="#0f172a"
        text-color="#94a3b8"
        active-text-color="#a5b4fc"
        router
        style="border-right: none"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>{{ t("nav.dashboard") }}</span>
        </el-menu-item>
        <el-menu-item index="/agents">
          <el-icon><User /></el-icon>
          <span>{{ t("nav.agents") }}</span>
        </el-menu-item>
        <el-menu-item index="/knowledge-bases">
          <el-icon><Collection /></el-icon>
          <span>{{ t("nav.knowledge") }}</span>
        </el-menu-item>
        <el-menu-item index="/providers">
          <el-icon><Connection /></el-icon>
          <span>{{ t("nav.models") }}</span>
        </el-menu-item>
        <el-menu-item index="/tools">
          <el-icon><SetUp /></el-icon>
          <span>{{ t("nav.tools") }}</span>
        </el-menu-item>
        <el-menu-item index="/skills">
          <el-icon><MagicStick /></el-icon>
          <span>{{ t("nav.skills") }}</span>
        </el-menu-item>
        <el-menu-item index="/sessions">
          <el-icon><ChatDotSquare /></el-icon>
          <span>{{ t("nav.sessions") }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="app-header">
        <h1 class="page-title">{{ pageTitle }}</h1>
        <div class="header-actions">
          <el-select
            :model-value="locale"
            size="small"
            style="width: 116px"
            :aria-label="t('common.language')"
            @change="setLocale"
          >
            <el-option
              v-for="option in localeOptions"
              :key="option.value"
              :label="t(option.labelKey)"
              :value="option.value"
            />
          </el-select>
          <el-button size="small" @click="showSettings = true">
            <el-icon><Setting /></el-icon>
          </el-button>
        </div>
      </el-header>
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>

    <el-dialog v-model="showSettings" :title="t('settings.title')" width="400px">
      <el-form label-width="120px">
        <el-form-item :label="t('settings.adminSecret')">
          <el-input
            v-model="adminSecret"
            type="password"
            show-password
            :placeholder="t('settings.adminSecretPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="danger" @click="clearSecret">{{ t("settings.logout") }}</el-button>
        <el-button @click="showSettings = false">{{ t("common.close") }}</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  DataAnalysis,
  User,
  Connection,
  Collection,
  SetUp,
  MagicStick,
  ChatDotSquare,
  Setting,
} from "@element-plus/icons-vue";
import { locale, localeOptions, setLocale, t } from "@/i18n";

const route = useRoute();
const showSettings = ref(false);
const adminSecret = ref(localStorage.getItem("adminSecret") || "");

const activeMenu = computed(() => {
  const path = route.path;
  if (path.startsWith("/agents")) return "/agents";
  if (path.startsWith("/knowledge-bases")) return "/knowledge-bases";
  if (path.startsWith("/sessions")) return "/sessions";
  return path;
});

const pageTitles = {
  "/dashboard": "nav.dashboard",
  "/agents": "page.agentManagement",
  "/knowledge-bases": "page.knowledgeManagement",
  "/providers": "page.modelManagement",
  "/tools": "page.toolRegistry",
  "/skills": "page.skillManagement",
  "/sessions": "page.conversationHistory",
} as const;

const pageTitle = computed(() => {
  for (const [prefix, key] of Object.entries(pageTitles)) {
    if (route.path.startsWith(prefix)) return t(key);
  }
  return "AgentForge";
});

watch(adminSecret, (value) => {
  if (value) {
    localStorage.setItem("adminSecret", value);
  } else {
    localStorage.removeItem("adminSecret");
  }
});

function clearSecret() {
  localStorage.removeItem("adminSecret");
  showSettings.value = false;
  window.location.reload();
}
</script>

<style scoped>
.app-shell {
  height: 100%;
}
.app-sidebar {
  background: #0f172a;
}
.app-header {
  background: #fff;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}
.page-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  letter-spacing: 0;
}
.app-main {
  background: #f8fafc;
  overflow-y: auto;
  padding: 24px;
}
.logo {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.logo-icon {
  font-size: 20px;
  background: linear-gradient(135deg, #818cf8, #6366f1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.logo-text {
  font-size: 17px;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: 0.5px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 720px) {
  .app-shell {
    flex-direction: column;
  }
  .app-sidebar {
    width: 100% !important;
    flex: none;
  }
  .logo {
    height: 52px;
    justify-content: flex-start;
    padding: 0 16px;
  }
  .app-sidebar :deep(.el-menu) {
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
  }
  .app-sidebar :deep(.el-menu-item) {
    flex: 0 0 auto;
    height: 44px;
    line-height: 44px;
  }
  .app-header {
    min-height: 56px;
    height: auto;
    gap: 12px;
    padding: 10px 16px;
  }
  .page-title {
    min-width: 0;
  }
  .header-actions {
    flex-shrink: 0;
  }
  .app-main {
    padding: 16px;
  }
}
</style>
