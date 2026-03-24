<template>
  <div>
    <div class="page-header">
      <h2>Dashboard</h2>
    </div>
    <el-row :gutter="20" style="margin-bottom: 20px">
      <el-col :span="6" v-for="card in statCards" :key="card.label">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-value">{{ card.value }}</div>
            <div class="stat-label">{{ card.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <el-card>
      <template #header>
        <span>Daily Usage (Last 30 Days)</span>
      </template>
      <div ref="chartRef" style="height: 350px"></div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import * as echarts from "echarts";
import { getStats, getDailyStats } from "@/api";

const chartRef = ref<HTMLElement>();
const statCards = ref([
  { label: "Total Agents", value: 0 },
  { label: "Sessions Today", value: 0 },
  { label: "Tokens Today", value: 0 },
  { label: "Active Agents", value: 0 },
]);

async function loadStats() {
  try {
    const { data } = await getStats();
    statCards.value = [
      { label: "Total Agents", value: data.totalAgents ?? 0 },
      { label: "Sessions Today", value: data.sessionsToday ?? 0 },
      { label: "Tokens Today", value: (data.tokensToday ?? 0).toLocaleString() },
      { label: "Active Agents", value: data.activeAgents ?? 0 },
    ];
  } catch {
    // API not available yet
  }
}

async function loadChart() {
  if (!chartRef.value) return;
  const chart = echarts.init(chartRef.value);

  let dates: string[] = [];
  let tokensIn: number[] = [];
  let tokensOut: number[] = [];

  try {
    const { data } = await getDailyStats();
    dates = data.map((d: { date: string }) => d.date);
    tokensIn = data.map((d: { tokensIn: number }) => d.tokensIn);
    tokensOut = data.map((d: { tokensOut: number }) => d.tokensOut);
  } catch {
    // Use empty data
  }

  chart.setOption({
    tooltip: { trigger: "axis" },
    legend: { data: ["Tokens In", "Tokens Out"] },
    xAxis: { type: "category", data: dates },
    yAxis: { type: "value" },
    series: [
      { name: "Tokens In", type: "line", smooth: true, data: tokensIn, itemStyle: { color: "#409eff" } },
      { name: "Tokens Out", type: "line", smooth: true, data: tokensOut, itemStyle: { color: "#67c23a" } },
    ],
  });

  window.addEventListener("resize", () => chart.resize());
}

onMounted(() => {
  loadStats();
  loadChart();
});
</script>
