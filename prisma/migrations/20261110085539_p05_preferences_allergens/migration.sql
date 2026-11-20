-- CreateEnum
CREATE TYPE "Allergen" AS ENUM ('PEANUT', 'TREE_NUT', 'SEAFOOD', 'FISH', 'BEEF', 'LAMB', 'PORK', 'POULTRY', 'EGG', 'DAIRY', 'GLUTEN', 'SOY', 'SESAME', 'ALCOHOL');

-- AlterTable
ALTER TABLE "dishes" ADD COLUMN     "allergens" "Allergen"[] DEFAULT ARRAY[]::"Allergen"[];

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "likedCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dislikedCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergens" "Allergen"[] DEFAULT ARRAY[]::"Allergen"[],
    "spicyMax" INTEGER NOT NULL DEFAULT 3,
    "priceMax" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
