-- Vazba úkolu na úkon katalogu (recept) + zadané parametry (m²/m³…) pro proklik.
ALTER TABLE "Task" ADD COLUMN "operationId" TEXT;
ALTER TABLE "Task" ADD COLUMN "operationParams" TEXT;
