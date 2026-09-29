-- Položka dokladu: jde do přiznání? a vlastní kategorie.
-- Stávající položky nárok nemění, proto DEFAULT true.
ALTER TABLE "dms"."ExpenseItem" ADD COLUMN "deductible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "dms"."ExpenseItem" ADD COLUMN "category" TEXT;
