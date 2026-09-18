-- Nahradit dříve navržený plán.
ALTER TABLE "PlanDraft" ADD COLUMN "replaceExisting" BOOLEAN NOT NULL DEFAULT false;
