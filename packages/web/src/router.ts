import { createRouter, createWebHistory } from "vue-router";
import { ensureCurrentUser } from "./auth";

const routes = [
  {
    path: "/login",
    name: "Login",
    meta: { public: true },
    component: () => import("./views/Login.vue"),
  },
  {
    path: "/public",
    name: "PublicLanding",
    meta: { public: true },
    component: () => import("./views/PublicLanding.vue"),
  },
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
    path: "/tenants",
    name: "TenantManagement",
    component: () => import("./views/TenantManagement.vue"),
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

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const user = await ensureCurrentUser();
  if (!user) return { path: "/login", query: { redirect: to.fullPath } };
  return true;
});
