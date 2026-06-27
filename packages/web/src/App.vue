<template>
  <el-config-provider :locale="elementLocale">
    <Layout />
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed } from "vue";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import ja from "element-plus/es/locale/lang/ja";
import en from "element-plus/es/locale/lang/en";
import Layout from "./components/Layout.vue";
import { locale } from "./i18n";

const elementLocale = computed(() => {
  if (locale.value === "zh") return zhCn;
  if (locale.value === "ja") return ja;
  return en;
});
</script>
