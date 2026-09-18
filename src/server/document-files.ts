import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Smaže záznamy přes `removeRows` a pak i jejich soubory z úložiště (R2).
 *
 * Mazání projektu, žádanky nebo nabídky mazalo dokumenty jen v databázi
 * (kaskádou) – soubory na R2 zůstávaly navždy a nikdo na ně už neukazoval.
 *
 * Pořadí: nejdřív se zjistí, o které soubory jde, pak se smažou záznamy
 * a teprve potom soubory. Kdyby mazání v databázi selhalo, soubory
 * zůstanou a nevzniknou záznamy ukazující na neexistující soubor.
 */
export async function deleteWithFiles(
  documents: Prisma.DocumentWhereInput,
  removeRows: () => Promise<unknown>,
) {
  const files = await prisma.document.findMany({ where: documents, select: { fileName: true } });
  await removeRows();
  await Promise.all(files.map((f) => storage.delete(f.fileName).catch(() => undefined)));
}
