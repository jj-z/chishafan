-- CreateTable
CREATE TABLE "search_logs" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_call_logs" (
    "id" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_logs_resultCount_createdAt_idx" ON "search_logs"("resultCount", "createdAt");

-- CreateIndex
CREATE INDEX "search_logs_createdAt_idx" ON "search_logs"("createdAt");

-- CreateIndex
CREATE INDEX "ai_call_logs_createdAt_ok_idx" ON "ai_call_logs"("createdAt", "ok");
