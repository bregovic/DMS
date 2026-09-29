-- Doklad z pošty se čte dřív, než se ví, do jakého projektu patří.
-- Projekt i dokument proto vznikají až potvrzením.
ALTER TABLE "dms"."DocScan" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "dms"."DocScan" ALTER COLUMN "documentId" DROP NOT NULL;
ALTER TABLE "dms"."DocScan" ADD COLUMN "inboundAttachmentId" TEXT;

CREATE UNIQUE INDEX "DocScan_inboundAttachmentId_key" ON "dms"."DocScan"("inboundAttachmentId");
CREATE INDEX "DocScan_status_idx" ON "dms"."DocScan"("status");

ALTER TABLE "dms"."DocScan" ADD CONSTRAINT "DocScan_inboundAttachmentId_fkey"
  FOREIGN KEY ("inboundAttachmentId") REFERENCES "dms"."InboundAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
