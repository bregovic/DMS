-- Poptávkový balíček (#40): sdružení žádanek + společná nabídka na celek.

CREATE TABLE "dms"."RequestBundle" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'otevreno',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RequestBundle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RequestBundle_projectId_idx" ON "dms"."RequestBundle"("projectId");

ALTER TABLE "dms"."RequestBundle" ADD CONSTRAINT "RequestBundle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "dms"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dms"."RequestBundle" ADD CONSTRAINT "RequestBundle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "dms"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "dms"."BundleOffer" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "vendorId" TEXT,
    "vendorName" TEXT,
    "price" DECIMAL(12,2),
    "priceWithoutVat" DECIMAL(12,2),
    "deliveryDate" TIMESTAMP(3),
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'nova',
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "extractionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BundleOffer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BundleOffer_bundleId_idx" ON "dms"."BundleOffer"("bundleId");
CREATE INDEX "BundleOffer_vendorId_idx" ON "dms"."BundleOffer"("vendorId");

ALTER TABLE "dms"."BundleOffer" ADD CONSTRAINT "BundleOffer_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "dms"."RequestBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dms"."BundleOffer" ADD CONSTRAINT "BundleOffer_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "dms"."Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dms"."BundleOffer" ADD CONSTRAINT "BundleOffer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "dms"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dms"."Request" ADD COLUMN "bundleId" TEXT;
CREATE INDEX "Request_bundleId_idx" ON "dms"."Request"("bundleId");
ALTER TABLE "dms"."Request" ADD CONSTRAINT "Request_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "dms"."RequestBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dms"."Offer" ADD COLUMN "bundleOfferId" TEXT;
CREATE INDEX "Offer_bundleOfferId_idx" ON "dms"."Offer"("bundleOfferId");
ALTER TABLE "dms"."Offer" ADD CONSTRAINT "Offer_bundleOfferId_fkey" FOREIGN KEY ("bundleOfferId") REFERENCES "dms"."BundleOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dms"."Document" ADD COLUMN "bundleOfferId" TEXT;
CREATE INDEX "Document_bundleOfferId_idx" ON "dms"."Document"("bundleOfferId");
ALTER TABLE "dms"."Document" ADD CONSTRAINT "Document_bundleOfferId_fkey" FOREIGN KEY ("bundleOfferId") REFERENCES "dms"."BundleOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Porovnání může patřit žádance nebo balíčku.
ALTER TABLE "dms"."OfferComparison" ALTER COLUMN "requestId" DROP NOT NULL;
ALTER TABLE "dms"."OfferComparison" ADD COLUMN "bundleId" TEXT;
CREATE INDEX "OfferComparison_bundleId_idx" ON "dms"."OfferComparison"("bundleId");
ALTER TABLE "dms"."OfferComparison" ADD CONSTRAINT "OfferComparison_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "dms"."RequestBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
