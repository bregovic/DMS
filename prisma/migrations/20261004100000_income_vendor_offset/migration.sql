-- Zápočet půjčky od dodavatele proti tomu, co se mu platí.
-- settledAmount drží, kolik z příjmu už bylo započteno – bez toho by se
-- tentýž zápočet odečítal od každé další platby.
ALTER TABLE "dms"."Income" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "dms"."Income" ADD COLUMN "settledAmount" DECIMAL(12,2);

CREATE INDEX "Income_vendorId_idx" ON "dms"."Income"("vendorId");

ALTER TABLE "dms"."Income" ADD CONSTRAINT "Income_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "dms"."Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
