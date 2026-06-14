-- AlterTable: žádanka navázaná na úkol + dodací lhůta
ALTER TABLE "Request" ADD COLUMN     "taskId" TEXT,
ADD COLUMN     "leadDays" INTEGER;

-- AlterTable: výdaj navázaný na úkol
ALTER TABLE "Expense" ADD COLUMN     "taskId" TEXT;

-- CreateIndex
CREATE INDEX "Request_taskId_idx" ON "Request"("taskId");

-- CreateIndex
CREATE INDEX "Expense_taskId_idx" ON "Expense"("taskId");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
