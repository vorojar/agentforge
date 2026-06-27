<template>
  <el-config-provider :locale="elementLocale">
    <Layout v-if="!route.meta.public" />
    <router-view v-else />
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import ja from "element-plus/es/locale/lang/ja";
import en from "element-plus/es/locale/lang/en";
import Layout from "./components/Layout.vue";
import { locale } from "./i18n";

const route = useRoute();
const elementLocale = computed(() => {
  if (locale.value === "zh") return zhCn;
  if (locale.value === "ja") return ja;
  return en;
});
</script>
