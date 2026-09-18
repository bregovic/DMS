-- Útrata za AI nezávislá na projektech (limity).
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");
-- dosavadní útrata
INSERT INTO "AiUsageLog" ("id","kind","model","costUsd","createdAt")
SELECT 'x' || "id", 'extraction', "model", "costUsd", "createdAt" FROM "Extraction" WHERE "costUsd" IS NOT NULL
UNION ALL SELECT 'c' || "id", 'comparison', "model", "costUsd", "createdAt" FROM "OfferComparison" WHERE "costUsd" IS NOT NULL
UNION ALL SELECT 'p' || "id", 'plan', "model", "costUsd", "createdAt" FROM "PlanDraft" WHERE "costUsd" IS NOT NULL;
