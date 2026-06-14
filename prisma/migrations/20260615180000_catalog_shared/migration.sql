-- Katalog je nově sdílený (společný pro všechny uživatele): kód unikátní globálně.
DROP INDEX "Material_ownerId_code_key";
CREATE UNIQUE INDEX "Material_code_key" ON "Material"("code");

DROP INDEX "Operation_ownerId_code_key";
CREATE UNIQUE INDEX "Operation_code_key" ON "Operation"("code");
