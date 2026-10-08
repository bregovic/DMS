-- Nabídky po položkách (#47): řádky společné nabídky a rozbor výrobků.
ALTER TABLE "dms"."BundleOffer" ADD COLUMN "itemsStatus" TEXT;
ALTER TABLE "dms"."BundleOffer" ADD COLUMN "itemsError" TEXT;
ALTER TABLE "dms"."BundleOffer" ADD COLUMN "itemsInfo" JSONB;
ALTER TABLE "dms"."BundleOffer" ADD COLUMN "itemsCostUsd" DOUBLE PRECISION;
ALTER TABLE "dms"."BundleOffer" ADD COLUMN "itemsAt" TIMESTAMP(3);

CREATE TABLE "dms"."OfferItem" (
    "id" TEXT NOT NULL,
    "bundleOfferId" TEXT NOT NULL,
    "requestId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'product',
    "alternative" TEXT,
    "position" TEXT,
    "title" TEXT NOT NULL,
    "product" TEXT,
    "widthMm" INTEGER,
    "heightMm" INTEGER,
    "quantity" DECIMAL(12,2),
    "unit" TEXT,
    "unitPrice" DECIMAL(12,2),
    "priceWithoutVat" DECIMAL(12,2),
    "priceWithVat" DECIMAL(12,2),
    "specs" JSONB,
    "description" TEXT,
    "mismatch" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OfferItem_bundleOfferId_idx" ON "dms"."OfferItem"("bundleOfferId");
CREATE INDEX "OfferItem_requestId_idx" ON "dms"."OfferItem"("requestId");
ALTER TABLE "dms"."OfferItem" ADD CONSTRAINT "OfferItem_bundleOfferId_fkey"
  FOREIGN KEY ("bundleOfferId") REFERENCES "dms"."BundleOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dms"."OfferItem" ADD CONSTRAINT "OfferItem_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "dms"."Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "dms"."ItemReview" (
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
    CONSTRAINT "ItemReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ItemReview_requestId_idx" ON "dms"."ItemReview"("requestId");
ALTER TABLE "dms"."ItemReview" ADD CONSTRAINT "ItemReview_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "dms"."Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
