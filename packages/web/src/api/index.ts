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

// --- Skills (read-only, loaded from filesystem) ---
export const getSkills = () => api.get("/skills");
export const importSkill = (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return api.post("/skills/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
export const reloadSkills = () => api.post("/skills/reload");

// --- Chat (uses agent API key, not admin secret) ---
export const chatWithAgent = (apiKey: string, message: string, sessionId?: string) =>
  axios.post("/api/chat", { message, sessionId }, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

// --- Test Chat (admin auth, no API key needed) ---
export const testChat = (agentId: string, message: string, sessionId?: string) =>
  api.post(`/agents/${agentId}/chat`, { message, sessionId });

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
