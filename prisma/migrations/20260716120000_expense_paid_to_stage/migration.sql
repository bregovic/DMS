-- Sjednocení úhrady výdaje: stav "uhrazeno" nahrazuje boolean paid.
-- Nejdřív přenes existující paid=true do stavu, pak zruš sloupec.
UPDATE "Expense" SET "stage" = 'uhrazeno'
  WHERE "paid" = true AND ("stage" IS NULL OR "stage" <> 'uhrazeno');

ALTER TABLE "Expense" DROP COLUMN "paid";
