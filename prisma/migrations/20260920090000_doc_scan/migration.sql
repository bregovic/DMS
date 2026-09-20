-- Vytěžení účtenek a faktur: daňové údaje u výdaje, položky dokladu, sken.
ALTER TABLE "Expense" ADD COLUMN "docNumber" TEXT;
ALTER TABLE "Expense" ADD COLUMN "taxDate" TIMESTAMP(3);
ALTER TABLE "Expense" ADD COLUMN "vatBase" DECIMAL(12,2);
ALTER TABLE "Expense" ADD COLUMN "vatAmount" DECIMAL(12,2);
ALTER TABLE "Expense" ADD COLUMN "vatRate" DECIMAL(5,2);
ALTER TABLE "Expense" ADD COLUMN "vatBreakdown" JSONB;
ALTER TABLE "Expense" ADD COLUMN "supplierIco" TEXT;
ALTER TABLE "Expense" ADD COLUMN "supplierDic" TEXT;
ALTER TABLE "Expense" ADD COLUMN "deductible" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "ExpenseItem" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "line" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(12,3),
  "unit" TEXT,
  "unitPrice" DECIMAL(12,2),
  "amount" DECIMAL(12,2) NOT NULL,
  "vatRate" DECIMAL(5,2),
  "materialCode" TEXT,
  "catalogPrice" DECIMAL(12,2),
  "diffPct" DECIMAL(7,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExpenseItem_expenseId_idx" ON "ExpenseItem"("expenseId");
CREATE INDEX "ExpenseItem_materialCode_idx" ON "ExpenseItem"("materialCode");
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DocScan" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "result" JSONB,
  "error" TEXT,
  "model" TEXT NOT NULL,
  "costUsd" DOUBLE PRECISION,
  "expenseId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocScan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocScan_documentId_key" ON "DocScan"("documentId");
CREATE INDEX "DocScan_projectId_status_idx" ON "DocScan"("projectId", "status");
ALTER TABLE "DocScan" ADD CONSTRAINT "DocScan_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
