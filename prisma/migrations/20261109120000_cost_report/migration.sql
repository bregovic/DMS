-- Report nákladů projektu / složky (#48).
CREATE TABLE "dms"."CostReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subProjectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "prompt" TEXT,
    "data" JSONB,
    "result" JSONB,
    "error" TEXT,
    "model" TEXT NOT NULL,
    "costUsd" DOUBLE PRECISION,
    "documentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CostReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CostReport_projectId_idx" ON "dms"."CostReport"("projectId");
CREATE INDEX "CostReport_createdAt_idx" ON "dms"."CostReport"("createdAt");
ALTER TABLE "dms"."CostReport" ADD CONSTRAINT "CostReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "dms"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
