-- AlterTable: procento dokončení úkolu
ALTER TABLE "Task" ADD COLUMN     "percentDone" INTEGER NOT NULL DEFAULT 0;
