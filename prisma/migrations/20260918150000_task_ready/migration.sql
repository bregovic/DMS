-- Úkol připravený k práci (todo list, #28). Výchozí true: stávající úkoly se
-- nemají tvářit, že na něco čekají.
ALTER TABLE "Task" ADD COLUMN "ready" BOOLEAN NOT NULL DEFAULT true;
