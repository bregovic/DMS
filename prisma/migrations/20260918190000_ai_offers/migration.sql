-- AI nabídky: pokyn a spárované části u vytěžení, úkoly do plánu u nabídky,
-- porovnání nabídek.
ALTER TABLE "Extraction" ADD COLUMN "instructions" TEXT;
ALTER TABLE "Extraction" ADD COLUMN "appliedParts" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "Offer" ADD COLUMN "extractionId" TEXT;
ALTER TABLE "Offer" ADD COLUMN "extractionPart" INTEGER;
ALTER TABLE "Offer" ADD COLUMN "planTasks" JSONB;
ALTER TABLE "Offer" ADD COLUMN "tasksCreatedAt" TIMESTAMP(3);

CREATE TABLE "OfferComparison" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "prompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "result" JSONB,
    "error" TEXT,
    "model" TEXT NOT NULL,
    "costUsd" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfferComparison_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OfferComparison_requestId_idx" ON "OfferComparison"("requestId");
CREATE INDEX "OfferComparison_createdAt_idx" ON "OfferComparison"("createdAt");
ALTER TABLE "OfferComparison" ADD CONSTRAINT "OfferComparison_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
