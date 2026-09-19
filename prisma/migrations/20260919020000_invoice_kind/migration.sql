-- Druh dokladu: faktura, nebo žádost o úhradu (kdo nemá živnost).
ALTER TABLE "Invoice" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'invoice';
