import { prisma } from "@/lib/prisma";
import { claimedTotals } from "@/lib/vat";

type VatRow = { rate: number; base: number; vat: number };

/** Změna u položky dokladu. `category` se přepíše jen když je uvedená. */
export type ZmenaPolozky = { id: string; deductible: boolean; category?: string | null };

export type NarokPatch = {
  vatBase: number | null;
  vatAmount: number | null;
  vatBreakdown?: VatRow[];
};

/**
 * Uloží změny položek a přepočítá, co z dokladu jde do přiznání.
 *
 * Nárok se počítá vždy z PŮVODNÍHO rozpisu dokladu (`vatBreakdownDoc`), ne
 * z toho, co je uložené jako uplatněné – jinak by se jednou odškrtnutá
 * položka nedala vrátit zpátky. Při plném nároku se vrátí čísla dokladu
 * beze změny, takže zůstane jeho zaokrouhlení.
 *
 * Sdílí to úprava výdaje i zaškrtnutí nároku v přehledu DPH – kdyby to byly
 * dvě cesty, rozešly by se.
 */
export async function prepocetNaroku(
  expenseId: string,
  zmeny: ZmenaPolozky[],
): Promise<NarokPatch | null> {
  const doc = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: {
      vatBase: true,
      vatAmount: true,
      vatBaseDoc: true,
      vatAmountDoc: true,
      vatBreakdown: true,
      vatBreakdownDoc: true,
      items: true,
    },
  });
  if (!doc) return null;

  const zmena = new Map(zmeny.map((z) => [z.id, z]));
  const dotcene = doc.items.filter((i) => zmena.has(i.id));
  if (dotcene.length)
    await prisma.$transaction(
      dotcene.map((i) => {
        const z = zmena.get(i.id)!;
        return prisma.expenseItem.update({
          where: { id: i.id },
          data: {
            deductible: z.deductible,
            ...("category" in z ? { category: z.category || null } : {}),
          },
        });
      }),
    );

  const rows = (doc.vatBreakdownDoc ?? doc.vatBreakdown ?? []) as VatRow[];
  const proPocet = doc.items.map((i) => ({
    amount: Number(i.amount),
    vatRate: i.vatRate != null ? Number(i.vatRate) : null,
    deductible: zmena.get(i.id)?.deductible ?? i.deductible,
  }));
  const c = claimedTotals(rows, proPocet);
  const plny = proPocet.every((i) => i.deductible);
  const baseDoc = doc.vatBaseDoc != null ? Number(doc.vatBaseDoc) : doc.vatBase != null ? Number(doc.vatBase) : null;
  const vatDoc = doc.vatAmountDoc != null ? Number(doc.vatAmountDoc) : doc.vatAmount != null ? Number(doc.vatAmount) : null;
  return {
    vatBase: plny ? baseDoc : c.base,
    vatAmount: plny ? vatDoc : c.vat,
    vatBreakdown: (plny ? rows : c.rows).length ? (plny ? rows : c.rows) : undefined,
  };
}
