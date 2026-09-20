ALTER TABLE "dms"."User" ADD COLUMN "taxOfficeDataBox" TEXT;

CREATE TABLE "dms"."TaxFiling" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "projectId" TEXT,
    "recipient" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "summary" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxFiling_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaxFiling_userId_year_period_idx" ON "dms"."TaxFiling"("userId", "year", "period");

ALTER TABLE "dms"."TaxFiling" ADD CONSTRAINT "TaxFiling_userId_fkey" FOREIGN KEY ("userId") REFERENCES "dms"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
