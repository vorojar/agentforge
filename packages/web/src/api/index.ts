import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// --- Auth ---
export const bootstrapAuth = () => api.get("/auth/bootstrap");
export const loginApi = (data: { email: string; password: string }) => api.post("/auth/login", data);
export const getCurrentUser = () => api.get("/auth/me");
export const logoutApi = () => api.post("/auth/logout");

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
export const updateSkillCategory = (name: string, category: string) =>
  api.put(`/skills/${name}/category`, { category });

// --- Skills Editor ---
export const getSkillFiles = (name: string) => api.get(`/skills/${name}/files`);
export const getSkillFile = (name: string, path: string) => api.get(`/skills/${name}/files/${path}`);
export const saveSkillFile = (name: string, path: string, content: string) => api.put(`/skills/${name}/files/${path}`, { content });
export const deleteSkillFile = (name: string, path: string) => api.delete(`/skills/${name}/files/${path}`);
export const renameSkillFile = (name: string, oldPath: string, newPath: string) =>
  api.patch(`/skills/${name}/files/rename`, { oldPath, newPath });
export const renameSkillApi = (name: string, newName: string) =>
  api.patch(`/skills/${name}/rename`, { newName });
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

// --- Knowledge Bases ---
export const getKnowledgeBases = () => api.get("/knowledge-bases");
export const getKnowledgeBase = (id: string) => api.get(`/knowledge-bases/${id}`);
export const createKnowledgeBase = (data: { name: string; description?: string }) =>
  api.post("/knowledge-bases", data);
export const updateKnowledgeBase = (id: string, data: { name?: string; description?: string }) =>
  api.put(`/knowledge-bases/${id}`, data);
export const deleteKnowledgeBase = (id: string) => api.delete(`/knowledge-bases/${id}`);

// --- Knowledge Sources (within a KB) ---
export const getKnowledgeSources = (kbId: string) => api.get(`/knowledge-bases/${kbId}/sources`);
export const uploadKnowledgeSource = (kbId: string, data: { name: string; content: string }) =>
  api.post(`/knowledge-bases/${kbId}/sources`, data);
export const getKnowledgeContent = (kbId: string, sourceName: string) =>
  api.get(`/knowledge-bases/${kbId}/sources/${encodeURIComponent(sourceName)}/content`);
export const updateKnowledgeContent = (kbId: string, sourceName: string, content: string) =>
  api.put(`/knowledge-bases/${kbId}/sources/${encodeURIComponent(sourceName)}/content`, { content });
export const renameKnowledgeSource = (kbId: string, sourceName: string, newName: string) =>
  api.patch(`/knowledge-bases/${kbId}/sources/${encodeURIComponent(sourceName)}`, { newName });
export const deleteKnowledgeSource = (kbId: string, sourceName: string) =>
  api.delete(`/knowledge-bases/${kbId}/sources/${encodeURIComponent(sourceName)}`);

// --- Agent-Knowledge Association ---
export const getAgentKnowledge = (agentId: string) => api.get(`/agents/${agentId}/knowledge`);
export const setAgentKnowledge = (agentId: string, kbIds: string[]) =>
  api.put(`/agents/${agentId}/knowledge`, { kbIds });

// --- Provider Channels ---
export const getChannels = (providerId: string) => api.get(`/providers/${providerId}/channels`);
export const createChannel = (providerId: string, name: string) =>
  api.post(`/providers/${providerId}/channels`, { name });
export const deleteChannel = (providerId: string, channelId: string) =>
  api.delete(`/providers/${providerId}/channels/${channelId}`);
export const getChannelStats = (channelId: string, days?: number) =>
  api.get(`/channels/${channelId}/stats`, { params: days ? { days } : {} });
export const getProviderChannelStats = (providerId: string, dateRange?: DateRange) =>
  api.get(`/providers/${providerId}/channels/stats`, { params: dateRange });

// --- Sessions ---
export const getSessions = (agentId?: string) =>
  api.get("/sessions", { params: agentId ? { agentId } : {} });
export const getSession = (id: string) => api.get(`/sessions/${id}`);
export const getSessionMessages = (id: string) =>
  api.get(`/sessions/${id}/messages`);
export const getSessionFamily = (id: string) => api.get(`/sessions/${id}/family`);
export const rerunSession = (id: string, data?: { providerId?: string; model?: string }) =>
  api.post(`/sessions/${id}/rerun`, data ?? {});
export const deleteSession = (id: string) => api.delete(`/sessions/${id}`);

// --- Stats ---
export interface DateRange { startDate?: string; endDate?: string }
export const getStats = () => api.get("/stats");
export const getAgentStats = (agentId: string) =>
  api.get(`/stats/agents/${agentId}`);
export const getDailyStats = (agentId?: string, days?: number, dateRange?: DateRange, granularity?: string) =>
  api.get("/stats/daily", { params: { ...(agentId ? { agentId } : {}), ...(days ? { days } : {}), ...dateRange, ...(granularity ? { granularity } : {}) } });
export const getModelStats = (dateRange?: DateRange) =>
  api.get("/stats/models", { params: dateRange });
export const getAgentUsageStats = (dateRange?: DateRange) =>
  api.get("/stats/agents", { params: dateRange });
export const getProxyOverview = () => api.get("/stats/proxy");
export const getProxyDailyStats = (days?: number, dateRange?: DateRange, granularity?: string) =>
  api.get("/stats/proxy/daily", { params: { ...(days ? { days } : {}), ...dateRange, ...(granularity ? { granularity } : {}) } });

export default api;
