-- Stav připravenosti fáze v plánování: ruční blokace s důvodem a práce
-- svépomocí (u ní se nehlásí „chybí dodavatel").
ALTER TABLE "Task" ADD COLUMN "blockNote" TEXT;
ALTER TABLE "Task" ADD COLUMN "selfPerformed" BOOLEAN NOT NULL DEFAULT false;
