-- Expense: příznak vyexportování do CSV (účetnictví)
ALTER TABLE "Expense" ADD COLUMN "exportedAt" TIMESTAMP(3);
