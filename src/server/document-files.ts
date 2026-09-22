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
  // Tentýž soubor může být odkazovaný z víc žádanek (jedna nabídka na víc
  // věcí). Smazat ho smíme, až na něj neukazuje žádný další dokument.
  const klice = [...new Set(files.map((f) => f.fileName))];
  if (klice.length === 0) return;
  const zbyva = new Set(
    (
      await prisma.document.findMany({ where: { fileName: { in: klice } }, select: { fileName: true } })
    ).map((d) => d.fileName),
  );
  await Promise.all(
    klice.filter((k) => !zbyva.has(k)).map((k) => storage.delete(k).catch(() => undefined)),
  );
}

/**
 * Složka žádanky v úložišti: všechno k jedné žádance (e-maily, nabídky,
 * podklady) leží pohromadě a jde to projít i přímo v Cloudflare R2.
 * Podle id, ne podle názvu – přejmenování žádanky složku nerozdělí.
 */
export function requestFolder(ownerId: string, projectId: string, requestId: string) {
  return `${ownerId}/${projectId}/zadanky/${requestId}`;
}

/** Složka poptávkového balíčku – přílohy společných nabídek (#40). */
export function bundleFolder(ownerId: string, projectId: string, bundleId: string) {
  return `${ownerId}/${projectId}/balicky/${bundleId}`;
}
