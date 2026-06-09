-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "hours" DECIMAL(10,2),
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'expense',
ADD COLUMN     "rate" DECIMAL(12,2),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'approved';

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "hourlyRate" DECIMAL(12,2);
