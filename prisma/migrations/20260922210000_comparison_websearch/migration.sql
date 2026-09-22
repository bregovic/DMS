-- Ověření dodavatele na webu u porovnání nabídek.
ALTER TABLE "dms"."OfferComparison" ADD COLUMN "webSearch" BOOLEAN NOT NULL DEFAULT false;
