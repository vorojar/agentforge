import { createRouter, createWebHistory } from "vue-router";

const routes = [
  {
    path: "/",
    redirect: "/dashboard",
  },
  {
    path: "/dashboard",
    name: "Dashboard",
    component: () => import("./views/Dashboard.vue"),
  },
  {
    path: "/agents",
    name: "AgentList",
    component: () => import("./views/AgentList.vue"),
  },
  {
    path: "/agents/new",
    name: "AgentCreate",
    component: () => import("./views/AgentEdit.vue"),
  },
  {
    path: "/agents/:id/edit",
    name: "AgentEdit",
    component: () => import("./views/AgentEdit.vue"),
  },
  {
    path: "/knowledge-bases",
    name: "KnowledgeBases",
    component: () => import("./views/KnowledgeBases.vue"),
  },
  {
    path: "/providers",
    name: "Providers",
    component: () => import("./views/Providers.vue"),
  },
  {
    path: "/tools",
    name: "ToolList",
    component: () => import("./views/ToolList.vue"),
  },
  {
    path: "/skills",
    name: "SkillList",
    component: () => import("./views/SkillList.vue"),
  },
  {
    path: "/sessions",
    name: "Sessions",
    component: () => import("./views/Sessions.vue"),
  },
  {
    path: "/sessions/:id",
    name: "SessionDetail",
    component: () => import("./views/SessionDetail.vue"),
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
