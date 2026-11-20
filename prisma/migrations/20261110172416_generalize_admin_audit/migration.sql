/*
  Warnings:

  - You are about to drop the column `targetUserId` on the `admin_audit_logs` table. All the data in the column will be lost.
  - Added the required column `targetId` to the `admin_audit_logs` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AdminAuditTargetType" AS ENUM ('USER', 'DISH', 'CATEGORY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminAuditAction" ADD VALUE 'CREATE_DISH';
ALTER TYPE "AdminAuditAction" ADD VALUE 'UPDATE_DISH';
ALTER TYPE "AdminAuditAction" ADD VALUE 'DELETE_DISH';
ALTER TYPE "AdminAuditAction" ADD VALUE 'CREATE_CATEGORY';
ALTER TYPE "AdminAuditAction" ADD VALUE 'UPDATE_CATEGORY';
ALTER TYPE "AdminAuditAction" ADD VALUE 'DELETE_CATEGORY';

-- DropForeignKey
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT "admin_audit_logs_targetUserId_fkey";

-- DropIndex
DROP INDEX "admin_audit_logs_targetUserId_createdAt_idx";

-- AlterTable
ALTER TABLE "admin_audit_logs" DROP COLUMN "targetUserId",
ADD COLUMN     "targetId" TEXT NOT NULL,
ADD COLUMN     "targetType" "AdminAuditTargetType" NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE INDEX "admin_audit_logs_targetType_targetId_createdAt_idx" ON "admin_audit_logs"("targetType", "targetId", "createdAt");
