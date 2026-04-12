/**
 * 知识库相关类型定义
 * 功能：独立知识库实体、知识源、分块的类型
 * 创建时间：2026-03-31
 * 负责人：王觉贤
 */

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseCreateInput {
  name: string;
  description?: string;
}

export interface KnowledgeBaseUpdateInput {
  name?: string;
  description?: string;
}

export interface KnowledgeSource {
  sourceName: string;
  chunkCount: number;
}

export interface KnowledgeSearchResult {
  sourceName: string;
  content: string;
  score: number;
  kbName?: string;
}
