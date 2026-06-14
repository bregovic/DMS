-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "offerId" TEXT,
ADD COLUMN     "requestId" TEXT;

-- CreateIndex
CREATE INDEX "Expense_requestId_idx" ON "Expense"("requestId");

-- CreateIndex
CREATE INDEX "Expense_offerId_idx" ON "Expense"("offerId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
