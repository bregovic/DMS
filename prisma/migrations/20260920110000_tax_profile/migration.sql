-- Údaje pro daňová podání (kontrolní hlášení): typ subjektu, adresa, kontakt, FÚ.
ALTER TABLE "User" ADD COLUMN "taxSubjectType" TEXT;
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;
ALTER TABLE "User" ADD COLUMN "street" TEXT;
ALTER TABLE "User" ADD COLUMN "houseNo" TEXT;
ALTER TABLE "User" ADD COLUMN "orientNo" TEXT;
ALTER TABLE "User" ADD COLUMN "city" TEXT;
ALTER TABLE "User" ADD COLUMN "zip" TEXT;
ALTER TABLE "User" ADD COLUMN "country" TEXT DEFAULT 'ČESKÁ REPUBLIKA';
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "dataBoxId" TEXT;
ALTER TABLE "User" ADD COLUMN "taxOfficeCode" TEXT;
ALTER TABLE "User" ADD COLUMN "taxOfficeBranch" TEXT;
