<!--
  Dashboard 仪表板
  功能：总览统计（累计）、统一时间筛选、Agent 用量趋势、渠道转发趋势、模型/Agent/渠道用量表格
  创建时间：2026-03-31
  负责人：王觉贤
  最后更新时间：2026-04-03
-->
<template>
  <div>
    <!-- Summary cards row 1: Agent usage (always cumulative) -->
    <el-row :gutter="16" style="margin-bottom: 20px">
      <el-col :span="6" v-for="card in statCards" :key="card.label">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-value">{{ card.value }}</div>
            <div class="stat-label">{{ card.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Summary cards row 2: Proxy/Channel usage (always cumulative) -->
    <el-row :gutter="16" style="margin-bottom: 20px">
      <el-col :span="6" v-for="card in proxyCards" :key="card.label">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-value" style="color: #e6a23c">{{ card.value }}</div>
            <div class="stat-label">{{ card.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Unified time filter -->
    <el-card style="margin-bottom: 20px" shadow="never" class="filter-card">
      <div class="filter-bar">
        <span class="filter-label">{{ t("dashboard.timeRange") }}</span>
        <el-radio-group v-model="activePreset" size="small" @change="onPresetChange">
          <el-radio-button value="today">{{ t("dashboard.today") }}</el-radio-button>
          <el-radio-button value="yesterday">{{ t("dashboard.yesterday") }}</el-radio-button>
          <el-radio-button value="7">{{ t("dashboard.days7") }}</el-radio-button>
          <el-radio-button value="30">{{ t("dashboard.days30") }}</el-radio-button>
          <el-radio-button value="90">{{ t("dashboard.days90") }}</el-radio-button>
          <el-radio-button value="custom">{{ t("dashboard.custom") }}</el-radio-button>
        </el-radio-group>
        <el-date-picker
          v-if="activePreset === 'custom'"
          v-model="customDateRange"
          type="daterange"
          range-separator="—"
          :start-placeholder="t('dashboard.startDate')"
          :end-placeholder="t('dashboard.endDate')"
          size="small"
          value-format="YYYY-MM-DD"
          :clearable="false"
          style="margin-left: 12px; width: 280px"
          @change="onCustomDateChange"
        />
        <span class="filter-hint">
          {{ filterDescription }}
        </span>
      </div>
    </el-card>

    <!-- Agent Usage Chart -->
    <el-card style="margin-bottom: 20px">
      <template #header>
        <span>{{ t("dashboard.agentTrend") }}</span>
      </template>
      <div ref="chartRef" style="height: 320px"></div>
    </el-card>

    <!-- Proxy Channel Chart -->
    <el-card style="margin-bottom: 20px">
      <template #header>
        <span>{{ t("dashboard.channelTrend") }}</span>
      </template>
      <div ref="proxyChartRef" style="height: 320px"></div>
    </el-card>

    <!-- Three tables -->
    <el-row :gutter="16">
      <el-col :span="8">
        <el-card>
          <template #header><span>{{ t("dashboard.usageByModel") }}</span></template>
          <el-table :data="modelStats" stripe size="small" class="dashboard-usage-table">
            <el-table-column prop="model" :label="t('common.model')" min-width="120" show-overflow-tooltip />
            <el-table-column :label="t('common.requests')" width="104" align="right" label-class-name="nowrap-table-header">
              <template #default="{ row }">{{ row.requests.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column :label="t('common.tokens')" width="100" align="right">
              <template #default="{ row }">{{ (row.tokensIn + row.tokensOut).toLocaleString() }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header><span>{{ t("dashboard.usageByAgent") }}</span></template>
          <el-table :data="agentStats" stripe size="small" class="dashboard-usage-table">
            <el-table-column prop="name" :label="t('common.agent')" min-width="120" show-overflow-tooltip />
            <el-table-column :label="t('common.requests')" width="104" align="right" label-class-name="nowrap-table-header">
              <template #default="{ row }">{{ row.totalRequests.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column :label="t('common.tokens')" width="100" align="right">
              <template #default="{ row }">{{ (row.totalTokensIn + row.totalTokensOut).toLocaleString() }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header><span>{{ t("dashboard.usageByChannel") }}</span></template>
          <el-table :data="channelStats" stripe size="small" :empty-text="t('dashboard.noChannelData')" class="dashboard-usage-table">
            <el-table-column prop="channelName" :label="t('common.channel')" min-width="120" show-overflow-tooltip />
            <el-table-column :label="t('common.requests')" width="104" align="right" label-class-name="nowrap-table-header">
              <template #default="{ row }">{{ row.totalRequests.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column :label="t('common.tokens')" width="100" align="right">
              <template #default="{ row }">{{ (row.totalTokensIn + row.totalTokensOut).toLocaleString() }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import * as echarts from "echarts";
import {
  getStats, getDailyStats, getModelStats, getAgentUsageStats,
  getProxyOverview, getProxyDailyStats, getProviders, getProviderChannelStats,
  type DateRange,
} from "@/api";
import { locale, t } from "@/i18n";

const chartRef = ref<HTMLElement>();
const proxyChartRef = ref<HTMLElement>();
let chartInstance: echarts.ECharts | null = null;
let proxyChartInstance: echarts.ECharts | null = null;
let resizeHandler: (() => void) | null = null;

const activePreset = ref("30");
const customDateRange = ref<[string, string]>(["", ""]);

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const currentDateRange = computed<DateRange>(() => {
  const preset = activePreset.value;
  if (preset === "today") {
    const today = formatDate(new Date());
    return { startDate: today, endDate: today };
  }
  if (preset === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = formatDate(d);
    return { startDate: yesterday, endDate: yesterday };
  }
  if (preset === "custom" && customDateRange.value[0] && customDateRange.value[1]) {
    return { startDate: customDateRange.value[0], endDate: customDateRange.value[1] };
  }
  return {};
});

const currentDays = computed<number | undefined>(() => {
  const preset = activePreset.value;
  if (preset !== "custom" && preset !== "today" && preset !== "yesterday") {
    return parseInt(preset);
  }
  return undefined;
});

const isSingleDay = computed(() => {
  const range = currentDateRange.value;
  return !!(range.startDate && range.endDate && range.startDate === range.endDate);
});

const currentGranularity = computed<string | undefined>(() => {
  return isSingleDay.value ? "hour" : undefined;
});

const filterDescription = computed(() => {
  const preset = activePreset.value;
  if (preset === "today") return t("dashboard.today");
  if (preset === "yesterday") return t("dashboard.yesterday");
  if (preset === "custom") {
    if (customDateRange.value[0] && customDateRange.value[1]) {
      return `${customDateRange.value[0]} ~ ${customDateRange.value[1]}`;
    }
    return t("dashboard.selectDateRange");
  }
  return t("dashboard.lastDays", { days: preset });
});

const statValues = ref({
  totalSessions: "0",
  sessionsToday: "0",
  agentRequests: "0",
  agentTokens: "0",
});

const proxyValues = ref({
  proxyChannels: "0",
  proxyRequests: "0",
  proxyTokensIn: "0",
  proxyTokensOut: "0",
});

const statCards = computed(() => [
  { label: t("dashboard.totalSessions"), value: statValues.value.totalSessions },
  { label: t("dashboard.sessionsToday"), value: statValues.value.sessionsToday },
  { label: t("dashboard.agentRequests"), value: statValues.value.agentRequests },
  { label: t("dashboard.agentTokens"), value: statValues.value.agentTokens },
]);

const proxyCards = computed(() => [
  { label: t("dashboard.proxyChannels"), value: proxyValues.value.proxyChannels },
  { label: t("dashboard.proxyRequests"), value: proxyValues.value.proxyRequests },
  { label: t("dashboard.proxyTokensIn"), value: proxyValues.value.proxyTokensIn },
  { label: t("dashboard.proxyTokensOut"), value: proxyValues.value.proxyTokensOut },
]);

interface ModelStat { model: string; requests: number; tokensIn: number; tokensOut: number }
interface AgentStat { name: string; totalRequests: number; totalTokensIn: number; totalTokensOut: number }
interface ChannelStat { channelId: string; channelName: string; totalRequests: number; totalTokensIn: number; totalTokensOut: number }

const modelStats = ref<ModelStat[]>([]);
const agentStats = ref<AgentStat[]>([]);
const channelStats = ref<ChannelStat[]>([]);

function onPresetChange() {
  if (activePreset.value !== "custom") {
    loadFilteredData();
  }
}

function onCustomDateChange() {
  if (customDateRange.value[0] && customDateRange.value[1]) {
    loadFilteredData();
  }
}

function loadFilteredData() {
  loadChart();
  loadProxyChart();
  loadModelStats();
  loadAgentStats();
  loadChannelStats();
}

async function loadStats() {
  try {
    const { data } = await getStats();
    statValues.value = {
      totalSessions: (data.totalSessions ?? 0).toLocaleString(),
      sessionsToday: String(data.sessionsToday ?? 0),
      agentRequests: (data.totalRequests ?? 0).toLocaleString(),
      agentTokens: ((data.totalTokensIn ?? 0) + (data.totalTokensOut ?? 0)).toLocaleString(),
    };
  } catch { /* ignore */ }
}

async function loadProxyStats() {
  try {
    const { data } = await getProxyOverview();
    proxyValues.value = {
      proxyChannels: (data.totalChannels ?? 0).toLocaleString(),
      proxyRequests: (data.totalRequests ?? 0).toLocaleString(),
      proxyTokensIn: (data.totalTokensIn ?? 0).toLocaleString(),
      proxyTokensOut: (data.totalTokensOut ?? 0).toLocaleString(),
    };
  } catch { /* ignore */ }
}

async function loadModelStats() {
  try {
    const { data } = await getModelStats(currentDateRange.value);
    modelStats.value = data;
  } catch { /* ignore */ }
}

async function loadAgentStats() {
  try {
    const { data } = await getAgentUsageStats(currentDateRange.value);
    agentStats.value = data;
  } catch { /* ignore */ }
}

async function loadChannelStats() {
  try {
    const { data: providers } = await getProviders();
    const all: ChannelStat[] = [];
    const results = await Promise.all(
      providers.map((p: { id: string }) => getProviderChannelStats(p.id, currentDateRange.value).then(r => r.data).catch(() => []))
    );
    for (const stats of results) {
      all.push(...stats);
    }
    channelStats.value = all.sort((a: ChannelStat, b: ChannelStat) => b.totalRequests - a.totalRequests);
  } catch { /* ignore */ }
}

function initChart(el: HTMLElement): echarts.ECharts {
  const instance = echarts.init(el);
  if (!resizeHandler) {
    resizeHandler = () => { chartInstance?.resize(); proxyChartInstance?.resize(); };
    window.addEventListener("resize", resizeHandler);
  }
  return instance;
}

function formatXLabel(dateStr: string, hourly: boolean): string {
  if (hourly) {
    const parts = dateStr.split(" ");
    return parts[1] || dateStr;
  }
  return dateStr.slice(5);
}

function emptyUsageChartOption() {
  return {
    tooltip: { trigger: "axis" },
    legend: { data: [t("dashboard.tokensIn"), t("dashboard.tokensOut"), t("common.requests")] },
    grid: { left: 60, right: 60, bottom: 30, top: 40 },
    xAxis: { type: "category", data: [] },
    yAxis: [
      { type: "value", name: t("common.tokens") },
      { type: "value", name: t("common.requests"), splitLine: { show: false } },
    ],
    series: [
      { name: t("dashboard.tokensIn"), type: "bar", stack: "tokens", data: [], itemStyle: { color: "#409eff" } },
      { name: t("dashboard.tokensOut"), type: "bar", stack: "tokens", data: [], itemStyle: { color: "#67c23a" } },
      { name: t("common.requests"), type: "line", yAxisIndex: 1, smooth: true, data: [], itemStyle: { color: "#e6a23c" } },
    ],
  };
}

function emptyProxyChartOption() {
  return {
    ...emptyUsageChartOption(),
    series: [
      { name: t("dashboard.tokensIn"), type: "bar", stack: "tokens", data: [], itemStyle: { color: "#f56c6c" } },
      { name: t("dashboard.tokensOut"), type: "bar", stack: "tokens", data: [], itemStyle: { color: "#e6a23c" } },
      { name: t("common.requests"), type: "line", yAxisIndex: 1, smooth: true, data: [], itemStyle: { color: "#909399" } },
    ],
  };
}

function renderChart(instance: echarts.ECharts, option: unknown) {
  instance.clear();
  instance.setOption(option as echarts.EChartsOption, true);
}

async function loadChart() {
  if (!chartRef.value) return;
  if (!chartInstance) chartInstance = initChart(chartRef.value);
  const hourly = isSingleDay.value;

  try {
    const { data } = await getDailyStats(undefined, currentDays.value, currentDateRange.value, currentGranularity.value);
    renderChart(chartInstance, {
      tooltip: { trigger: "axis" },
      legend: { data: [t("dashboard.tokensIn"), t("dashboard.tokensOut"), t("common.requests")] },
      grid: { left: 60, right: 60, bottom: 30, top: 40 },
      xAxis: { type: "category", data: data.map((d: { date: string }) => formatXLabel(d.date, hourly)) },
      yAxis: [
        { type: "value", name: t("common.tokens") },
        { type: "value", name: t("common.requests"), splitLine: { show: false } },
      ],
      series: [
        { name: t("dashboard.tokensIn"), type: "bar", stack: "tokens", data: data.map((d: { tokensIn: number }) => d.tokensIn), itemStyle: { color: "#409eff" } },
        { name: t("dashboard.tokensOut"), type: "bar", stack: "tokens", data: data.map((d: { tokensOut: number }) => d.tokensOut), itemStyle: { color: "#67c23a" } },
        { name: t("common.requests"), type: "line", yAxisIndex: 1, smooth: true, data: data.map((d: { requests: number }) => d.requests), itemStyle: { color: "#e6a23c" } },
      ],
    });
  } catch {
    renderChart(chartInstance, emptyUsageChartOption());
  }
}

async function loadProxyChart() {
  if (!proxyChartRef.value) return;
  if (!proxyChartInstance) proxyChartInstance = initChart(proxyChartRef.value);
  const hourly = isSingleDay.value;

  try {
    const { data } = await getProxyDailyStats(currentDays.value, currentDateRange.value, currentGranularity.value);
    renderChart(proxyChartInstance, {
      tooltip: { trigger: "axis" },
      legend: { data: [t("dashboard.tokensIn"), t("dashboard.tokensOut"), t("common.requests")] },
      grid: { left: 60, right: 60, bottom: 30, top: 40 },
      xAxis: { type: "category", data: data.map((d: { date: string }) => formatXLabel(d.date, hourly)) },
      yAxis: [
        { type: "value", name: t("common.tokens") },
        { type: "value", name: t("common.requests"), splitLine: { show: false } },
      ],
      series: [
        { name: t("dashboard.tokensIn"), type: "bar", stack: "tokens", data: data.map((d: { tokensIn: number }) => d.tokensIn), itemStyle: { color: "#f56c6c" } },
        { name: t("dashboard.tokensOut"), type: "bar", stack: "tokens", data: data.map((d: { tokensOut: number }) => d.tokensOut), itemStyle: { color: "#e6a23c" } },
        { name: t("common.requests"), type: "line", yAxisIndex: 1, smooth: true, data: data.map((d: { requests: number }) => d.requests), itemStyle: { color: "#909399" } },
      ],
    });
  } catch {
    renderChart(proxyChartInstance, emptyProxyChartOption());
  }
}

onMounted(() => {
  loadStats();
  loadProxyStats();
  loadFilteredData();
});

watch(locale, () => {
  loadChart();
  loadProxyChart();
});

onUnmounted(() => {
  if (resizeHandler) window.removeEventListener("resize", resizeHandler);
  chartInstance?.dispose();
  proxyChartInstance?.dispose();
  chartInstance = null;
  proxyChartInstance = null;
});
</script>

<style scoped>
.stat-card {
  text-align: center;
  padding: 8px 0;
}
.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #409eff;
  margin-bottom: 4px;
}
.stat-label {
  font-size: 13px;
  color: #909399;
}
.filter-card {
  background: #fafbfc;
}
.filter-card :deep(.el-card__body) {
  padding: 12px 20px;
}
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.filter-label {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
  white-space: nowrap;
}
.filter-hint {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
}
.dashboard-usage-table :deep(.nowrap-table-header .cell) {
  white-space: nowrap;
  word-break: keep-all;
}
</style>
