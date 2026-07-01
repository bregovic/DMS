-- Označení příloh jako stažené/vyexportované (hromadné stažení příloh z úložiště)
ALTER TABLE "Document" ADD COLUMN "exportedAt" TIMESTAMP(3);
