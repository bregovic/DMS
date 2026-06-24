-- Ruční zámek termínu úkolu/fáze: když je true, automatický přepočet rozvrhu ho nepřepíše.
ALTER TABLE "Task" ADD COLUMN "dateLocked" BOOLEAN NOT NULL DEFAULT false;
