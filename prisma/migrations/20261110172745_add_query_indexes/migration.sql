-- CreateIndex
CREATE INDEX "dishes_isPublished_deletedAt_idx" ON "dishes"("isPublished", "deletedAt");

-- CreateIndex
CREATE INDEX "favorites_dishId_idx" ON "favorites"("dishId");
