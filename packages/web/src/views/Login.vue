<template>
  <main class="login-page">
    <section class="login-panel">
      <div class="brand">
        <span class="brand-mark">⚡</span>
        <div>
          <h1>AgentForge</h1>
          <p>{{ t("auth.subtitle") }}</p>
        </div>
      </div>

      <el-form class="login-form" label-position="top" @submit.prevent="submit">
        <el-form-item :label="t('auth.email')">
          <el-input
            v-model="email"
            autocomplete="username"
            :placeholder="t('auth.emailPlaceholder')"
            size="large"
            @keyup.enter="submit"
          />
        </el-form-item>
        <el-form-item :label="t('auth.password')">
          <el-input
            v-model="password"
            type="password"
            autocomplete="current-password"
            show-password
            :placeholder="t('auth.passwordPlaceholder')"
            size="large"
            @keyup.enter="submit"
          />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" class="login-button" @click="submit">
          {{ t("auth.signIn") }}
        </el-button>
      </el-form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { login } from "@/auth";
import { t } from "@/i18n";

const route = useRoute();
const router = useRouter();
const email = ref("");
const password = ref("");
const loading = ref(false);

async function submit() {
  if (!email.value.trim() || !password.value) {
    ElMessage.warning(t("auth.missingCredentials"));
    return;
  }

  loading.value = true;
  try {
    await login(email.value.trim(), password.value);
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/dashboard";
    await router.replace(redirect);
  } catch {
    ElMessage.error(t("auth.failed"));
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f8fafc;
  padding: 24px;
}
.login-panel {
  width: min(420px, 100%);
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 16px 45px rgba(15, 23, 42, 0.08);
  padding: 32px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
}
.brand-mark {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: #eef2ff;
  color: #4f46e5;
  font-size: 22px;
}
.brand h1 {
  margin: 0;
  color: #111827;
  font-size: 22px;
  line-height: 1.2;
}
.brand p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 14px;
}
.login-form {
  display: grid;
  gap: 4px;
}
.login-button {
  width: 100%;
  margin-top: 8px;
}
</style>
