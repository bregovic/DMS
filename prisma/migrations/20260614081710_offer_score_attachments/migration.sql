-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "offerId" TEXT;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "rating" TEXT,
ADD COLUMN     "score" INTEGER;

-- CreateIndex
CREATE INDEX "Document_offerId_idx" ON "Document"("offerId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
