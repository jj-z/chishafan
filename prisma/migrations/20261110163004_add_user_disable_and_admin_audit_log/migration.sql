-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('DISABLE_USER', 'ENABLE_USER', 'CHANGE_ROLE', 'RESET_PASSWORD');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "disabledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" "AdminAuditAction" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_targetUserId_createdAt_idx" ON "admin_audit_logs"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_adminId_createdAt_idx" ON "admin_audit_logs"("adminId", "createdAt");

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
