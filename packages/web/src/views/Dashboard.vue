<template>
  <div>
    <div class="page-header">
      <h2>Dashboard</h2>
    </div>

    <!-- Summary cards -->
    <el-row :gutter="16" style="margin-bottom: 20px">
      <el-col :span="4" v-for="card in statCards" :key="card.label">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-value">{{ card.value }}</div>
            <div class="stat-label">{{ card.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Chart with time range selector -->
    <el-card style="margin-bottom: 20px">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>Usage Trends</span>
          <el-radio-group v-model="chartRange" size="small" @change="loadChart">
            <el-radio-button value="7">7 Days</el-radio-button>
            <el-radio-button value="30">30 Days</el-radio-button>
            <el-radio-button value="90">90 Days</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <div ref="chartRef" style="height: 320px"></div>
    </el-card>

    <!-- Model usage table -->
    <el-card>
      <template #header>
        <span>Usage by Model</span>
      </template>
      <el-table :data="modelStats" stripe size="small">
        <el-table-column prop="model" label="Model" min-width="200" />
        <el-table-column label="Requests" width="120" align="right">
          <template #default="{ row }">{{ row.requests.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="Tokens In" width="140" align="right">
          <template #default="{ row }">{{ row.tokensIn.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="Tokens Out" width="140" align="right">
          <template #default="{ row }">{{ row.tokensOut.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="Total Tokens" width="150" align="right">
          <template #default="{ row }">{{ (row.tokensIn + row.tokensOut).toLocaleString() }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import * as echarts from "echarts";
import { getStats, getDailyStats, getModelStats } from "@/api";

const chartRef = ref<HTMLElement>();
let chartInstance: echarts.ECharts | null = null;
let resizeHandler: (() => void) | null = null;
const chartRange = ref("30");

const statCards = ref([
  { label: "Total Agents", value: 0 },
  { label: "Active Agents", value: 0 },
  { label: "Total Sessions", value: 0 },
  { label: "Sessions Today", value: 0 },
  { label: "Total Requests", value: 0 },
  { label: "Total Tokens", value: 0 },
]);

const modelStats = ref<Array<{ model: string; requests: number; tokensIn: number; tokensOut: number }>>([]);

async function loadStats() {
  try {
    const { data } = await getStats();
    statCards.value = [
      { label: "Total Agents", value: data.totalAgents ?? 0 },
      { label: "Active Agents", value: data.activeAgents ?? 0 },
      { label: "Total Sessions", value: data.totalSessions ?? 0 },
      { label: "Sessions Today", value: data.sessionsToday ?? 0 },
      { label: "Total Requests", value: (data.totalRequests ?? 0).toLocaleString() },
      { label: "Total Tokens", value: ((data.totalTokensIn ?? 0) + (data.totalTokensOut ?? 0)).toLocaleString() },
    ];
  } catch {
    // ignore
  }
}

async function loadModelStats() {
  try {
    const { data } = await getModelStats();
    modelStats.value = data;
  } catch {
    // ignore
  }
}

async function loadChart() {
  if (!chartRef.value) return;
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
    resizeHandler = () => chartInstance?.resize();
    window.addEventListener("resize", resizeHandler);
  }

  let dates: string[] = [];
  let tokensIn: number[] = [];
  let tokensOut: number[] = [];
  let requests: number[] = [];

  try {
    const { data } = await getDailyStats(undefined, parseInt(chartRange.value));
    dates = data.map((d: { date: string }) => d.date);
    tokensIn = data.map((d: { tokensIn: number }) => d.tokensIn);
    tokensOut = data.map((d: { tokensOut: number }) => d.tokensOut);
    requests = data.map((d: { requests: number }) => d.requests);
  } catch {
    // empty data
  }

  chartInstance.setOption({
    tooltip: { trigger: "axis" },
    legend: { data: ["Tokens In", "Tokens Out", "Requests"] },
    xAxis: { type: "category", data: dates },
    yAxis: [
      { type: "value", name: "Tokens" },
      { type: "value", name: "Requests", splitLine: { show: false } },
    ],
    series: [
      { name: "Tokens In", type: "bar", stack: "tokens", data: tokensIn, itemStyle: { color: "#409eff" } },
      { name: "Tokens Out", type: "bar", stack: "tokens", data: tokensOut, itemStyle: { color: "#67c23a" } },
      { name: "Requests", type: "line", yAxisIndex: 1, smooth: true, data: requests, itemStyle: { color: "#e6a23c" } },
    ],
  }, true);
}

onMounted(() => {
  loadStats();
  loadModelStats();
  loadChart();
});

onUnmounted(() => {
  if (resizeHandler) window.removeEventListener("resize", resizeHandler);
  chartInstance?.dispose();
  chartInstance = null;
});
</script>
