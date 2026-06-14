-- AlterTable: dodavatel u úkolu
ALTER TABLE "Task" ADD COLUMN     "vendorId" TEXT;

-- CreateIndex
CREATE INDEX "Task_vendorId_idx" ON "Task"("vendorId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
