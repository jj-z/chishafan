-- CreateEnum
CREATE TYPE "DishFeedbackAction" AS ENUM ('DISLIKE');

-- CreateTable
CREATE TABLE "dish_feedbacks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "action" "DishFeedbackAction" NOT NULL DEFAULT 'DISLIKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dish_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dish_feedbacks_userId_action_createdAt_idx" ON "dish_feedbacks"("userId", "action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "dish_feedbacks_userId_dishId_action_key" ON "dish_feedbacks"("userId", "dishId", "action");

-- AddForeignKey
ALTER TABLE "dish_feedbacks" ADD CONSTRAINT "dish_feedbacks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_feedbacks" ADD CONSTRAINT "dish_feedbacks_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
