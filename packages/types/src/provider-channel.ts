/**
 * Provider 渠道类型定义
 * 功能：Provider 转发渠道的密钥、统计相关类型
 * 创建时间：2026-03-31
 * 负责人：王觉贤
 */

export interface ProviderChannel {
  id: string;
  workspaceId: string;
  providerId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProxyUsageLog {
  workspaceId?: string;
  channelId: string;
  providerId: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

export interface ChannelStats {
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  daily: Array<{
    date: string;
    requests: number;
    tokensIn: number;
    tokensOut: number;
  }>;
}
