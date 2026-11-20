-- AI 问答升级（D1）：pgvector 知识库索引 + Token 用量记账 + 检索未命中日志。

-- 1) 向量扩展必须最先创建：vector 列与 HNSW 索引都依赖它。
--    数据库镜像已切到 pgvector/pgvector:pg16；CI 与本机数据库需要同样可用。
--    shadow database 也会执行本文件，因此创建扩展需要建库权限。
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM ('DISH', 'FAQ');

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" TEXT NOT NULL,
    "sourceType" "KnowledgeSourceType" NOT NULL DEFAULT 'DISH',
    "sourceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" vector(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_chunks_sourceType_sourceId_idx" ON "knowledge_chunks"("sourceType", "sourceId");

-- HNSW 余弦索引：查询用 `<=>`（余弦距离），opclass 必须是 vector_cosine_ops。
-- 选 HNSW 而不是 ivfflat：ivfflat 需要先有数据训练、lists 参数难调，起步阶段召回不稳定。
-- m / ef_construction 取 pgvector 推荐默认值，10 万级以内够用。
CREATE INDEX "knowledge_chunks_embedding_idx"
  ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- CreateTable
CREATE TABLE "ai_usage_daily" (
    "id" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_daily_subjectKey_day_key" ON "ai_usage_daily"("subjectKey", "day");

-- CreateIndex
CREATE INDEX "ai_usage_daily_day_idx" ON "ai_usage_daily"("day");

-- CreateTable
CREATE TABLE "rag_miss_logs" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "topScore" DOUBLE PRECISION NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_miss_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rag_miss_logs_createdAt_idx" ON "rag_miss_logs"("createdAt");

-- 反馈动作增加「喜欢」（D7）。PostgreSQL 12+ 允许在事务内新增枚举值，
-- 只要同一事务不使用该新值；本迁移后段没有引用 LIKE，因此安全。
ALTER TYPE "DishFeedbackAction" ADD VALUE 'LIKE';
