-- Vystavené doklady (příjmy) s DPH: číslo, DUZP, rozpis, odběratel.
ALTER TABLE "Income" ADD COLUMN "docNumber" TEXT;
ALTER TABLE "Income" ADD COLUMN "taxDate" TIMESTAMP(3);
ALTER TABLE "Income" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "Income" ADD COLUMN "vatBase" DECIMAL(12,2);
ALTER TABLE "Income" ADD COLUMN "vatAmount" DECIMAL(12,2);
ALTER TABLE "Income" ADD COLUMN "vatBreakdown" JSONB;
ALTER TABLE "Income" ADD COLUMN "customerName" TEXT;
ALTER TABLE "Income" ADD COLUMN "customerIco" TEXT;
ALTER TABLE "Income" ADD COLUMN "customerDic" TEXT;
ALTER TABLE "Income" ADD COLUMN "taxable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Income" ADD COLUMN "documentId" TEXT;
