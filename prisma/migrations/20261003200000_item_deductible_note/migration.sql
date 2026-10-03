-- Krátké „proč není v nároku" u položky dokladu, aby šel návrh ověřit.
ALTER TABLE "dms"."ExpenseItem" ADD COLUMN "deductibleNote" TEXT;
