-- AlterTable
ALTER TABLE "SubProject" ADD COLUMN     "dependsOnId" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "SubProject" ADD CONSTRAINT "SubProject_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "SubProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
