-- Dodavatelský portál (#49): kritéria výběru a návrh dodavatelů.
ALTER TABLE "dms"."Tender" ADD COLUMN "criteria" TEXT;
ALTER TABLE "dms"."Tender" ADD COLUMN "aiStatus" TEXT;
ALTER TABLE "dms"."Tender" ADD COLUMN "aiError" TEXT;
ALTER TABLE "dms"."Tender" ADD COLUMN "aiPrompt" TEXT;
ALTER TABLE "dms"."Tender" ADD COLUMN "aiResult" JSONB;
ALTER TABLE "dms"."Tender" ADD COLUMN "aiCostUsd" DOUBLE PRECISION;
ALTER TABLE "dms"."Tender" ADD COLUMN "aiAt" TIMESTAMP(3);
