-- Dodavatel může být jen kontakt: stačí IČO nebo telefon, e-mail nepovinný.
-- Unikátnost (ownerId, email) zůstává – Postgres více NULL hodnot nekoliduje.
ALTER TABLE "dms"."Vendor" ALTER COLUMN "email" DROP NOT NULL;
