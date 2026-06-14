-- Procesní tabulky: katalog materiálů, úkonů, parametrů a receptů.

-- CreateTable: materiály
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'ks',
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "priceSource" TEXT,
    "priceDate" TIMESTAMP(3),
    "category" TEXT NOT NULL DEFAULT 'other',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable: úkony / procesy
CREATE TABLE "Operation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'm2',
    "quantityFormula" TEXT NOT NULL DEFAULT '1',
    "laborFormula" TEXT NOT NULL DEFAULT '0',
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: parametry úkonu
CREATE TABLE "OperationParam" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT,
    "defaultValue" DECIMAL(12,4),
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OperationParam_pkey" PRIMARY KEY ("id")
);

-- CreateTable: řádky receptu (spotřeba materiálu na úkon)
CREATE TABLE "OperationMaterial" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantityFormula" TEXT NOT NULL DEFAULT '0',
    "wastePct" DECIMAL(6,2),
    "note" TEXT,

    CONSTRAINT "OperationMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Material_ownerId_idx" ON "Material"("ownerId");
CREATE UNIQUE INDEX "Material_ownerId_code_key" ON "Material"("ownerId", "code");
CREATE INDEX "Operation_ownerId_idx" ON "Operation"("ownerId");
CREATE UNIQUE INDEX "Operation_ownerId_code_key" ON "Operation"("ownerId", "code");
CREATE INDEX "OperationParam_operationId_idx" ON "OperationParam"("operationId");
CREATE UNIQUE INDEX "OperationParam_operationId_key_key" ON "OperationParam"("operationId", "key");
CREATE INDEX "OperationMaterial_operationId_idx" ON "OperationMaterial"("operationId");
CREATE INDEX "OperationMaterial_materialId_idx" ON "OperationMaterial"("materialId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationParam" ADD CONSTRAINT "OperationParam_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationMaterial" ADD CONSTRAINT "OperationMaterial_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationMaterial" ADD CONSTRAINT "OperationMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
