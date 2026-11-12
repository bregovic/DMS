-- Řízení (#49): kritéria s vahou (jen pro zadavatele) a termín realizace.
ALTER TABLE "dms"."Tender" ADD COLUMN "weights" JSONB;
ALTER TABLE "dms"."Tender" ADD COLUMN "realization" TEXT;
