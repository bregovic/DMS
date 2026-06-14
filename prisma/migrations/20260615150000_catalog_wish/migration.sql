-- Procesní tabulky: poznámky o chybějících činnostech v katalogu (wishlist).
CREATE TABLE "CatalogWish" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogWish_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CatalogWish_ownerId_idx" ON "CatalogWish"("ownerId");

ALTER TABLE "CatalogWish" ADD CONSTRAINT "CatalogWish_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
