-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pendingPhone" TEXT,
ADD COLUMN     "pendingPhoneAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pendingPhoneCodeHash" TEXT,
ADD COLUMN     "pendingPhoneExpiresAt" TIMESTAMP(3);
