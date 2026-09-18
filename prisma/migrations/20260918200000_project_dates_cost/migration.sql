-- Termíny projektu a odhad nákladů úkolu (forecast, AI plán).
ALTER TABLE "Project" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "plannedEnd" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "actualEnd" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "costEstimate" DECIMAL(12,2);
ALTER TABLE "Task" ADD COLUMN "procurement" TEXT;

-- AI plán projektu z dokumentace.
CREATE TABLE "PlanDraft" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "prompt" TEXT,
    "documentIds" TEXT[],
    "result" JSONB,
    "error" TEXT,
    "model" TEXT NOT NULL,
    "costUsd" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanDraft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlanDraft_projectId_idx" ON "PlanDraft"("projectId");
CREATE INDEX "PlanDraft_createdAt_idx" ON "PlanDraft"("createdAt");
ALTER TABLE "PlanDraft" ADD CONSTRAINT "PlanDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
