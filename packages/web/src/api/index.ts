import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// Admin auth interceptor
api.interceptors.request.use((config) => {
  const secret = localStorage.getItem("adminSecret");
  if (secret) {
    config.headers["X-Admin-Secret"] = secret;
  }
  return config;
});

// --- Agents ---
export const getAgents = () => api.get("/agents");
export const getAgent = (id: string) => api.get(`/agents/${id}`);
export const createAgent = (data: Record<string, unknown>) =>
  api.post("/agents", data);
export const updateAgent = (id: string, data: Record<string, unknown>) =>
  api.put(`/agents/${id}`, data);
export const deleteAgent = (id: string) => api.delete(`/agents/${id}`);
export const createApiKey = (agentId: string, name?: string) =>
  api.post(`/agents/${agentId}/keys`, { name });
export const deleteApiKey = (agentId: string, keyId: string) =>
  api.delete(`/agents/${agentId}/keys/${keyId}`);

// --- Tools ---
export const getTools = () => api.get("/tools");

// --- Skills ---
export const getSkills = () => api.get("/skills");
export const createSkill = (data: Record<string, unknown>) =>
  api.post("/skills", data);
export const updateSkill = (id: string, data: Record<string, unknown>) =>
  api.put(`/skills/${id}`, data);
export const deleteSkill = (id: string) => api.delete(`/skills/${id}`);

// --- Sessions ---
export const getSessions = (agentId?: string) =>
  api.get("/sessions", { params: agentId ? { agentId } : {} });
export const getSession = (id: string) => api.get(`/sessions/${id}`);
export const getSessionMessages = (id: string) =>
  api.get(`/sessions/${id}/messages`);
export const deleteSession = (id: string) => api.delete(`/sessions/${id}`);

// --- Stats ---
export const getStats = () => api.get("/stats");
export const getAgentStats = (agentId: string) =>
  api.get(`/stats/agents/${agentId}`);
export const getDailyStats = (agentId?: string) =>
  api.get("/stats/daily", { params: agentId ? { agentId } : {} });

export default api;
