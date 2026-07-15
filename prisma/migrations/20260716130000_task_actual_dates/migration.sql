-- Skutečný začátek/konec úkolu (realita vs. odhad v Plánování).
ALTER TABLE "Task" ADD COLUMN "actualStart" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "actualEnd" TIMESTAMP(3);
