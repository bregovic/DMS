-- Procesní tabulky: balíčky procesů „na klíč" (sdílené).
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'm2',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PackageItem" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "qtyPerUnit" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "note" TEXT,

    CONSTRAINT "PackageItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Package_code_key" ON "Package"("code");
CREATE INDEX "Package_ownerId_idx" ON "Package"("ownerId");
CREATE INDEX "PackageItem_packageId_idx" ON "PackageItem"("packageId");
CREATE INDEX "PackageItem_operationId_idx" ON "PackageItem"("operationId");

ALTER TABLE "Package" ADD CONSTRAINT "Package_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackageItem" ADD CONSTRAINT "PackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackageItem" ADD CONSTRAINT "PackageItem_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
