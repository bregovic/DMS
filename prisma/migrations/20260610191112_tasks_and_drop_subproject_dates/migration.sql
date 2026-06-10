/*
  Warnings:

  - You are about to drop the column `deadline` on the `SubProject` table. All the data in the column will be lost.
  - You are about to drop the column `dependsOnId` on the `SubProject` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `SubProject` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "SubProject" DROP CONSTRAINT "SubProject_dependsOnId_fkey";

-- AlterTable
ALTER TABLE "SubProject" DROP COLUMN "deadline",
DROP COLUMN "dependsOnId",
DROP COLUMN "startDate";

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subProjectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeEmail" TEXT,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'todo',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_subProjectId_idx" ON "Task"("subProjectId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_subProjectId_fkey" FOREIGN KEY ("subProjectId") REFERENCES "SubProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
