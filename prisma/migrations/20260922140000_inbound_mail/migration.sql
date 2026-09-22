-- Doručená pošta (#41) + e-mailová oznámení.

ALTER TABLE "dms"."User" ADD COLUMN "notifyByEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "dms"."User" ADD COLUMN "notifyEmail" TEXT;

CREATE TABLE "dms"."InboundMail" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromName" TEXT,
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "bodyText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'nova',
    "projectId" TEXT,
    "requestId" TEXT,
    "suggestion" JSONB,
    "note" TEXT,
    "rawKey" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboundMail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundMail_messageId_key" ON "dms"."InboundMail"("messageId");
CREATE INDEX "InboundMail_ownerId_status_idx" ON "dms"."InboundMail"("ownerId", "status");
CREATE INDEX "InboundMail_receivedAt_idx" ON "dms"."InboundMail"("receivedAt");

ALTER TABLE "dms"."InboundMail" ADD CONSTRAINT "InboundMail_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "dms"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "dms"."InboundAttachment" (
    "id" TEXT NOT NULL,
    "mailId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "documentId" TEXT,
    CONSTRAINT "InboundAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InboundAttachment_mailId_idx" ON "dms"."InboundAttachment"("mailId");

ALTER TABLE "dms"."InboundAttachment" ADD CONSTRAINT "InboundAttachment_mailId_fkey" FOREIGN KEY ("mailId") REFERENCES "dms"."InboundMail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
