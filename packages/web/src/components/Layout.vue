<template>
  <el-container class="app-shell">
    <el-aside class="app-sidebar" width="230px">
      <div class="logo">
        <span class="logo-icon">⚡</span>
        <span class="logo-text">AgentForge</span>
      </div>
      <el-menu
        class="side-menu"
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
        <el-menu-item index="/tenants">
          <el-icon><OfficeBuilding /></el-icon>
          <span>{{ t("nav.tenants") }}</span>
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
      <el-dropdown trigger="click" placement="top-start" @command="handleUserCommand">
        <button class="user-card">
          <span class="user-avatar">{{ userInitials }}</span>
          <span class="user-meta">
            <span class="user-name">{{ currentUser?.displayName || currentUser?.email }}</span>
            <span class="user-role">{{ primaryRole }}</span>
          </span>
          <el-icon class="user-more"><MoreFilled /></el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item disabled>{{ currentUser?.email }}</el-dropdown-item>
            <el-dropdown-item divided command="logout">
              <el-icon><SwitchButton /></el-icon>
              {{ t("auth.logout") }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
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
        </div>
      </el-header>
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>

  </el-container>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  DataAnalysis,
  User,
  Connection,
  Collection,
  OfficeBuilding,
  SetUp,
  MagicStick,
  ChatDotSquare,
  MoreFilled,
  SwitchButton,
} from "@element-plus/icons-vue";
import { currentUser, logout } from "@/auth";
import { locale, localeOptions, setLocale, t } from "@/i18n";

const route = useRoute();
const router = useRouter();

const activeMenu = computed(() => {
  const path = route.path;
  if (path.startsWith("/agents")) return "/agents";
  if (path.startsWith("/knowledge-bases")) return "/knowledge-bases";
  if (path.startsWith("/tenants")) return "/tenants";
  if (path.startsWith("/sessions")) return "/sessions";
  return path;
});

const pageTitles = {
  "/dashboard": "nav.dashboard",
  "/agents": "page.agentManagement",
  "/knowledge-bases": "page.knowledgeManagement",
  "/providers": "page.modelManagement",
  "/tenants": "page.tenantManagement",
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

const userInitials = computed(() => {
  const value = currentUser.value?.displayName || currentUser.value?.email || "AF";
  return value.trim().slice(0, 2).toUpperCase();
});

const primaryRole = computed(() => {
  const role = currentUser.value?.memberships.find((membership) => membership.status === "active")?.role;
  const labels = {
    owner: "roles.owner",
    admin: "roles.admin",
    builder: "roles.builder",
    viewer: "roles.viewer",
  } as const;
  return role && role in labels ? t(labels[role as keyof typeof labels]) : t("roles.viewer");
});

async function handleUserCommand(command: string) {
  if (command === "logout") {
    await logout();
    await router.replace("/login");
  }
}
</script>

<style scoped>
.app-shell {
  height: 100%;
}
.app-sidebar {
  background: #0f172a;
  display: flex;
  flex-direction: column;
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
.side-menu {
  flex: 1;
}
.user-card {
  width: calc(100% - 24px);
  margin: 12px;
  padding: 10px;
  border: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  text-align: left;
}
.user-card:hover {
  background: rgba(255, 255, 255, 0.1);
}
.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #fb8d7f;
  color: #fff;
  font-weight: 600;
}
.user-meta {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.user-name,
.user-role {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-name {
  font-size: 14px;
  font-weight: 600;
}
.user-role {
  font-size: 12px;
  color: #94a3b8;
}
.user-more {
  color: #94a3b8;
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
  .user-card {
    display: none;
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
