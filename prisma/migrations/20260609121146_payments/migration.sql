-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "variableSymbol" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "bankAccount" TEXT;
