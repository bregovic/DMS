-- Druh AI návrhu: plán z dokumentace nebo odhad nákladů stávajícího plánu.
ALTER TABLE "PlanDraft" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'plan';
