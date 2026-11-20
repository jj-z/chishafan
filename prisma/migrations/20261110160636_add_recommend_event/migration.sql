-- CreateEnum
CREATE TYPE "RecommendEventType" AS ENUM ('IMPRESSION', 'CLICK', 'DINE');

-- CreateEnum
CREATE TYPE "RecommendSource" AS ENUM ('RANDOM', 'AI');

-- CreateTable
CREATE TABLE "recommend_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "dishId" TEXT NOT NULL,
    "type" "RecommendEventType" NOT NULL,
    "source" "RecommendSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommend_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recommend_events_eventId_key" ON "recommend_events"("eventId");

-- CreateIndex
CREATE INDEX "recommend_events_type_createdAt_idx" ON "recommend_events"("type", "createdAt");

-- CreateIndex
CREATE INDEX "recommend_events_dishId_type_createdAt_idx" ON "recommend_events"("dishId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "recommend_events_userId_createdAt_idx" ON "recommend_events"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "recommend_events" ADD CONSTRAINT "recommend_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommend_events" ADD CONSTRAINT "recommend_events_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
