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

// --- Providers ---
export const getProviders = () => api.get("/providers");
export const getProviderDetail = (id: string) => api.get(`/providers/${id}`);
export const createProviderApi = (data: Record<string, unknown>) => api.post("/providers", data);
export const updateProviderApi = (id: string, data: Record<string, unknown>) => api.put(`/providers/${id}`, data);
export const deleteProviderApi = (id: string) => api.delete(`/providers/${id}`);

// --- Tools ---
export const getTools = () => api.get("/tools");

// --- HTTP Tools ---
export const getHttpTools = () => api.get("/http-tools");
export const createHttpTool = (data: Record<string, unknown>) =>
  api.post("/http-tools", data);
export const updateHttpTool = (id: string, data: Record<string, unknown>) =>
  api.put(`/http-tools/${id}`, data);
export const deleteHttpTool = (id: string) => api.delete(`/http-tools/${id}`);
export const testHttpTool = (id: string, params: Record<string, string>) =>
  api.post(`/http-tools/${id}/test`, params);

// --- Skills ---
export const getSkills = () => api.get("/skills");
export const reloadSkills = () => api.post("/skills/reload");

// --- Skills Editor ---
export const getSkillFiles = (name: string) => api.get(`/skills/${name}/files`);
export const getSkillFile = (name: string, path: string) => api.get(`/skills/${name}/files/${path}`);
export const saveSkillFile = (name: string, path: string, content: string) => api.put(`/skills/${name}/files/${path}`, { content });
export const deleteSkillFile = (name: string, path: string) => api.delete(`/skills/${name}/files/${path}`);
export const createSkillApi = (data: { name: string; description: string }) => api.post("/skills", data);
export const deleteSkillApi = (name: string) => api.delete(`/skills/${name}`);

// --- Chat (uses agent API key, not admin secret) ---
export const chatWithAgent = (apiKey: string, message: string, sessionId?: string) =>
  axios.post("/api/chat", { message, sessionId }, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

// --- Test Chat (admin auth, no API key needed) ---
export const testChat = (
  agentId: string,
  message: string,
  sessionId?: string,
  images?: Array<{ type: "base64"; data: string; mediaType: string }>
) =>
  api.post(`/agents/${agentId}/chat`, { message, sessionId, images });

// --- Knowledge ---
export const getKnowledgeSources = (agentId: string) => api.get(`/agents/${agentId}/knowledge`);
export const uploadKnowledgeApi = (agentId: string, data: { name: string; content: string }) =>
  api.post(`/agents/${agentId}/knowledge`, data);
export const deleteKnowledgeApi = (agentId: string, sourceName: string) =>
  api.delete(`/agents/${agentId}/knowledge/${encodeURIComponent(sourceName)}`);

// --- Sessions ---
export const getSessions = (agentId?: string, limit?: number, offset?: number) =>
  api.get("/sessions", { params: { ...(agentId ? { agentId } : {}), ...(limit ? { limit } : {}), ...(offset ? { offset } : {}) } });
export const getSession = (id: string) => api.get(`/sessions/${id}`);
export const getSessionMessages = (id: string) =>
  api.get(`/sessions/${id}/messages`);
export const deleteSession = (id: string) => api.delete(`/sessions/${id}`);

// --- Stats ---
export const getStats = () => api.get("/stats");
export const getAgentStats = (agentId: string) =>
  api.get(`/stats/agents/${agentId}`);
export const getDailyStats = (agentId?: string, days?: number) =>
  api.get("/stats/daily", { params: { ...(agentId ? { agentId } : {}), ...(days ? { days } : {}) } });
export const getModelStats = () => api.get("/stats/models");
export const getAgentUsageStats = () => api.get("/stats/agents");

export default api;
