-- Procesní tabulky: hodinová sazba práce na úkonu (pro výpočet ceny práce).
ALTER TABLE "Operation" ADD COLUMN "laborRate" DECIMAL(12,2);
