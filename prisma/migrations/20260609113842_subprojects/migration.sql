-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "subProjectId" TEXT;

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "subProjectId" TEXT;

-- CreateTable
CREATE TABLE "SubProject" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "budget" DECIMAL(12,2),
    "deadline" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubProject_projectId_idx" ON "SubProject"("projectId");

-- CreateIndex
CREATE INDEX "SubProject_parentId_idx" ON "SubProject"("parentId");

-- CreateIndex
CREATE INDEX "Expense_subProjectId_idx" ON "Expense"("subProjectId");

-- CreateIndex
CREATE INDEX "Request_subProjectId_idx" ON "Request"("subProjectId");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_subProjectId_fkey" FOREIGN KEY ("subProjectId") REFERENCES "SubProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubProject" ADD CONSTRAINT "SubProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubProject" ADD CONSTRAINT "SubProject_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SubProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubProject" ADD CONSTRAINT "SubProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_subProjectId_fkey" FOREIGN KEY ("subProjectId") REFERENCES "SubProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
