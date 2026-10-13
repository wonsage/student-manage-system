-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('CALL', 'WECHAT', 'MEETING', 'TRIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CreditTxType" AS ENUM ('PURCHASE', 'DEDUCT', 'REFUND');

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "type" "FollowUpType" NOT NULL,
    "content" TEXT NOT NULL,
    "nextFollowUpAt" TIMESTAMP(3),
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "lessonId" TEXT,
    "type" "CreditTxType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_ups_studentId_idx" ON "follow_ups"("studentId");

-- CreateIndex
CREATE INDEX "follow_ups_adminId_idx" ON "follow_ups"("adminId");

-- CreateIndex
CREATE INDEX "follow_ups_nextFollowUpAt_idx" ON "follow_ups"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "credit_transactions_studentId_idx" ON "credit_transactions"("studentId");

-- CreateIndex
CREATE INDEX "credit_transactions_enrollmentId_idx" ON "credit_transactions"("enrollmentId");

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
