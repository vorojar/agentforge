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
        <span class="filter-label">Time Range</span>
        <el-radio-group v-model="activePreset" size="small" @change="onPresetChange">
          <el-radio-button value="today">Today</el-radio-button>
          <el-radio-button value="yesterday">Yesterday</el-radio-button>
          <el-radio-button value="7">7 Days</el-radio-button>
          <el-radio-button value="30">30 Days</el-radio-button>
          <el-radio-button value="90">90 Days</el-radio-button>
          <el-radio-button value="custom">Custom</el-radio-button>
        </el-radio-group>
        <el-date-picker
          v-if="activePreset === 'custom'"
          v-model="customDateRange"
          type="daterange"
          range-separator="—"
          start-placeholder="Start"
          end-placeholder="End"
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
        <span>Agent Usage Trends</span>
      </template>
      <div ref="chartRef" style="height: 320px"></div>
    </el-card>

    <!-- Proxy Channel Chart -->
    <el-card style="margin-bottom: 20px">
      <template #header>
        <span>Channel Forwarding Trends</span>
      </template>
      <div ref="proxyChartRef" style="height: 320px"></div>
    </el-card>

    <!-- Three tables -->
    <el-row :gutter="16">
      <el-col :span="8">
        <el-card>
          <template #header><span>Usage by Model</span></template>
          <el-table :data="modelStats" stripe size="small">
            <el-table-column prop="model" label="Model" min-width="120" show-overflow-tooltip />
            <el-table-column label="Requests" width="80" align="right">
              <template #default="{ row }">{{ row.requests.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="Tokens" width="100" align="right">
              <template #default="{ row }">{{ (row.tokensIn + row.tokensOut).toLocaleString() }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header><span>Usage by Agent</span></template>
          <el-table :data="agentStats" stripe size="small">
            <el-table-column prop="name" label="Agent" min-width="120" show-overflow-tooltip />
            <el-table-column label="Requests" width="80" align="right">
              <template #default="{ row }">{{ row.totalRequests.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="Tokens" width="100" align="right">
              <template #default="{ row }">{{ (row.totalTokensIn + row.totalTokensOut).toLocaleString() }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header><span>Usage by Channel</span></template>
          <el-table :data="channelStats" stripe size="small" empty-text="No channel data">
            <el-table-column prop="channelName" label="Channel" min-width="120" show-overflow-tooltip />
            <el-table-column label="Requests" width="80" align="right">
              <template #default="{ row }">{{ row.totalRequests.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="Tokens" width="100" align="right">
              <template #default="{ row }">{{ (row.totalTokensIn + row.totalTokensOut).toLocaleString() }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import * as echarts from "echarts";
import {
  getStats, getDailyStats, getModelStats, getAgentUsageStats,
  getProxyOverview, getProxyDailyStats, getProviders, getProviderChannelStats,
  type DateRange,
} from "@/api";

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
  if (preset === "today") return "Today";
  if (preset === "yesterday") return "Yesterday";
  if (preset === "custom") {
    if (customDateRange.value[0] && customDateRange.value[1]) {
      return `${customDateRange.value[0]} ~ ${customDateRange.value[1]}`;
    }
    return "Please select date range";
  }
  return `Last ${preset} days`;
});

const statCards = ref([
  { label: "Total Sessions", value: "0" },
  { label: "Sessions Today", value: "0" },
  { label: "Agent Requests", value: "0" },
  { label: "Agent Tokens", value: "0" },
]);

const proxyCards = ref([
  { label: "Proxy Channels", value: "0" },
  { label: "Proxy Requests", value: "0" },
  { label: "Proxy Tokens In", value: "0" },
  { label: "Proxy Tokens Out", value: "0" },
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
    statCards.value = [
      { label: "Total Sessions", value: (data.totalSessions ?? 0).toLocaleString() },
      { label: "Sessions Today", value: String(data.sessionsToday ?? 0) },
      { label: "Agent Requests", value: (data.totalRequests ?? 0).toLocaleString() },
      { label: "Agent Tokens", value: ((data.totalTokensIn ?? 0) + (data.totalTokensOut ?? 0)).toLocaleString() },
    ];
  } catch { /* ignore */ }
}

async function loadProxyStats() {
  try {
    const { data } = await getProxyOverview();
    proxyCards.value = [
      { label: "Proxy Channels", value: (data.totalChannels ?? 0).toLocaleString() },
      { label: "Proxy Requests", value: (data.totalRequests ?? 0).toLocaleString() },
      { label: "Proxy Tokens In", value: (data.totalTokensIn ?? 0).toLocaleString() },
      { label: "Proxy Tokens Out", value: (data.totalTokensOut ?? 0).toLocaleString() },
    ];
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

async function loadChart() {
  if (!chartRef.value) return;
  if (!chartInstance) chartInstance = initChart(chartRef.value);
  const hourly = isSingleDay.value;

  try {
    const { data } = await getDailyStats(undefined, currentDays.value, currentDateRange.value, currentGranularity.value);
    chartInstance.setOption({
      tooltip: { trigger: "axis" },
      legend: { data: ["Tokens In", "Tokens Out", "Requests"] },
      grid: { left: 60, right: 60, bottom: 30, top: 40 },
      xAxis: { type: "category", data: data.map((d: { date: string }) => formatXLabel(d.date, hourly)) },
      yAxis: [
        { type: "value", name: "Tokens" },
        { type: "value", name: "Requests", splitLine: { show: false } },
      ],
      series: [
        { name: "Tokens In", type: "bar", stack: "tokens", data: data.map((d: { tokensIn: number }) => d.tokensIn), itemStyle: { color: "#409eff" } },
        { name: "Tokens Out", type: "bar", stack: "tokens", data: data.map((d: { tokensOut: number }) => d.tokensOut), itemStyle: { color: "#67c23a" } },
        { name: "Requests", type: "line", yAxisIndex: 1, smooth: true, data: data.map((d: { requests: number }) => d.requests), itemStyle: { color: "#e6a23c" } },
      ],
    }, true);
  } catch {
    chartInstance.setOption({ xAxis: { data: [] }, series: [] }, true);
  }
}

async function loadProxyChart() {
  if (!proxyChartRef.value) return;
  if (!proxyChartInstance) proxyChartInstance = initChart(proxyChartRef.value);
  const hourly = isSingleDay.value;

  try {
    const { data } = await getProxyDailyStats(currentDays.value, currentDateRange.value, currentGranularity.value);
    proxyChartInstance.setOption({
      tooltip: { trigger: "axis" },
      legend: { data: ["Tokens In", "Tokens Out", "Requests"] },
      grid: { left: 60, right: 60, bottom: 30, top: 40 },
      xAxis: { type: "category", data: data.map((d: { date: string }) => formatXLabel(d.date, hourly)) },
      yAxis: [
        { type: "value", name: "Tokens" },
        { type: "value", name: "Requests", splitLine: { show: false } },
      ],
      series: [
        { name: "Tokens In", type: "bar", stack: "tokens", data: data.map((d: { tokensIn: number }) => d.tokensIn), itemStyle: { color: "#f56c6c" } },
        { name: "Tokens Out", type: "bar", stack: "tokens", data: data.map((d: { tokensOut: number }) => d.tokensOut), itemStyle: { color: "#e6a23c" } },
        { name: "Requests", type: "line", yAxisIndex: 1, smooth: true, data: data.map((d: { requests: number }) => d.requests), itemStyle: { color: "#909399" } },
      ],
    }, true);
  } catch {
    proxyChartInstance.setOption({ xAxis: { data: [] }, series: [] }, true);
  }
}

onMounted(() => {
  loadStats();
  loadProxyStats();
  loadFilteredData();
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
</style>
