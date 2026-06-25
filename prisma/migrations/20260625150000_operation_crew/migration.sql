-- Počet lidí v partě u úkonu → odhad dní = normohodiny / (8 × crew).
ALTER TABLE "Operation" ADD COLUMN "crew" INTEGER NOT NULL DEFAULT 1;
