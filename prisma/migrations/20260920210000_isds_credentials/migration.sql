ALTER TABLE "dms"."User" ADD COLUMN "isdsLogin" TEXT;
ALTER TABLE "dms"."User" ADD COLUMN "isdsPassword" TEXT;
ALTER TABLE "dms"."User" ADD COLUMN "isdsTest" BOOLEAN NOT NULL DEFAULT false;
