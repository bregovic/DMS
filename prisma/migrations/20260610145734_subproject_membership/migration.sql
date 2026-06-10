-- CreateTable
CREATE TABLE "SubProjectMembership" (
    "id" TEXT NOT NULL,
    "subProjectId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'active',
    "vendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubProjectMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubProjectMembership_email_idx" ON "SubProjectMembership"("email");

-- CreateIndex
CREATE INDEX "SubProjectMembership_projectId_idx" ON "SubProjectMembership"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SubProjectMembership_subProjectId_email_key" ON "SubProjectMembership"("subProjectId", "email");

-- AddForeignKey
ALTER TABLE "SubProjectMembership" ADD CONSTRAINT "SubProjectMembership_subProjectId_fkey" FOREIGN KEY ("subProjectId") REFERENCES "SubProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
