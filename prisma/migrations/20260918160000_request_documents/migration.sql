-- Přílohy hlavičky žádanky (#32): e-maily (.eml/.msg) a nabídky v PDF.
ALTER TABLE "Document" ADD COLUMN "requestId" TEXT;
ALTER TABLE "Document" ADD COLUMN "summary" TEXT;
CREATE INDEX "Document_requestId_idx" ON "Document"("requestId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
