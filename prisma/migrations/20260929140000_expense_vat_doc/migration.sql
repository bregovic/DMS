-- Původní rozpis DPH z dokladu vedle toho, co jde do přiznání.
-- U dosavadních výdajů se nárok nekrátil, takže doklad = to, co je uložené.
ALTER TABLE "dms"."Expense" ADD COLUMN "vatBaseDoc" DECIMAL(12,2);
ALTER TABLE "dms"."Expense" ADD COLUMN "vatAmountDoc" DECIMAL(12,2);
ALTER TABLE "dms"."Expense" ADD COLUMN "vatBreakdownDoc" JSONB;

UPDATE "dms"."Expense"
SET "vatBaseDoc" = "vatBase", "vatAmountDoc" = "vatAmount", "vatBreakdownDoc" = "vatBreakdown"
WHERE "vatBase" IS NOT NULL OR "vatAmount" IS NOT NULL;
