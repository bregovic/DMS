-- Dodavatelský portál (#49): poptávkové řízení, pozvánky, podání nabídek, galerie žádanky.
-- AlterTable
ALTER TABLE "dms"."Request" ADD COLUMN     "offerFields" JSONB;

-- AlterTable
ALTER TABLE "dms"."Offer" ADD COLUMN     "params" JSONB,
ADD COLUMN     "priceWithoutVat" DECIMAL(12,2),
ADD COLUMN     "submissionId" TEXT,
ADD COLUMN     "validUntil" TIMESTAMP(3),
ADD COLUMN     "vatRate" INTEGER;

-- AlterTable
ALTER TABLE "dms"."Document" ADD COLUMN     "gallery" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "dms"."Tender" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subProjectId" TEXT,
    "token" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT,
    "location" TEXT,
    "contact" TEXT,
    "deadline" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dms"."TenderRequest" (
    "tenderId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TenderRequest_pkey" PRIMARY KEY ("tenderId","requestId")
);

-- CreateTable
CREATE TABLE "dms"."TenderInvite" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "vendorId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dms"."TenderSubmission" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "inviteId" TEXT,
    "vendorId" TEXT,
    "code" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "ico" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "reply" TEXT,
    "replyPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tender_token_key" ON "dms"."Tender"("token");

-- CreateIndex
CREATE INDEX "Tender_projectId_idx" ON "dms"."Tender"("projectId");

-- CreateIndex
CREATE INDEX "TenderRequest_requestId_idx" ON "dms"."TenderRequest"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderInvite_token_key" ON "dms"."TenderInvite"("token");

-- CreateIndex
CREATE INDEX "TenderInvite_tenderId_idx" ON "dms"."TenderInvite"("tenderId");

-- CreateIndex
CREATE INDEX "TenderInvite_vendorId_idx" ON "dms"."TenderInvite"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderSubmission_code_key" ON "dms"."TenderSubmission"("code");

-- CreateIndex
CREATE INDEX "TenderSubmission_tenderId_idx" ON "dms"."TenderSubmission"("tenderId");

-- CreateIndex
CREATE INDEX "TenderSubmission_vendorId_idx" ON "dms"."TenderSubmission"("vendorId");

-- CreateIndex
CREATE INDEX "Offer_submissionId_idx" ON "dms"."Offer"("submissionId");

-- AddForeignKey
ALTER TABLE "dms"."Offer" ADD CONSTRAINT "Offer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "dms"."TenderSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dms"."Tender" ADD CONSTRAINT "Tender_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "dms"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dms"."Tender" ADD CONSTRAINT "Tender_subProjectId_fkey" FOREIGN KEY ("subProjectId") REFERENCES "dms"."SubProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dms"."Tender" ADD CONSTRAINT "Tender_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "dms"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dms"."TenderRequest" ADD CONSTRAINT "TenderRequest_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "dms"."Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dms"."TenderRequest" ADD CONSTRAINT "TenderRequest_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "dms"."Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dms"."TenderInvite" ADD CONSTRAINT "TenderInvite_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "dms"."Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dms"."TenderInvite" ADD CONSTRAINT "TenderInvite_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "dms"."Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dms"."TenderSubmission" ADD CONSTRAINT "TenderSubmission_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "dms"."Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dms"."TenderSubmission" ADD CONSTRAINT "TenderSubmission_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "dms"."TenderInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dms"."TenderSubmission" ADD CONSTRAINT "TenderSubmission_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "dms"."Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

