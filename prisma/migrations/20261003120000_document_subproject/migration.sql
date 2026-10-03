-- Složka u dokladu: kdo ho nahrál, určí i kam patří. Čtení pak zařazení
-- nehádá z obsahu, ale použije zadané (jako u štítku z pošty).
ALTER TABLE "dms"."Document" ADD COLUMN "subProjectId" TEXT;

CREATE INDEX "Document_subProjectId_idx" ON "dms"."Document"("subProjectId");

ALTER TABLE "dms"."Document" ADD CONSTRAINT "Document_subProjectId_fkey"
  FOREIGN KEY ("subProjectId") REFERENCES "dms"."SubProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
