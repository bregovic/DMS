-- Vytěžení nabídek přes AI (#33): návrh k potvrzení.
CREATE TABLE "Extraction" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "result" JSONB,
    "error" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Extraction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Extraction_projectId_idx" ON "Extraction"("projectId");
CREATE INDEX "Extraction_documentId_idx" ON "Extraction"("documentId");
CREATE INDEX "Extraction_createdAt_idx" ON "Extraction"("createdAt");
ALTER TABLE "Extraction" ADD CONSTRAINT "Extraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
