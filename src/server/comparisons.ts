import { prisma } from "@/lib/prisma";

/**
 * Zneplatnění porovnání nabídek (#33, #40).
 *
 * Report je odvozený z nabídek, ale ukládá se – a když se nabídky změní,
 * dál tvrdí svoje. Stalo se to v ostrém provozu: report z doby, kdy u
 * žádanky ležely dvě prázdné nabídky z balíčku, hlásil „nedá se vybrat“
 * ještě dlouho poté, co ty nabídky zmizely a zůstala jediná s cenou.
 *
 * Proto se při každé změně nabídek smaže; spočítat znovu trvá půl minuty.
 * Když je žádanka v balíčku, padá i porovnání za celý balíček.
 */
export async function dropComparisons(opts: { requestIds?: string[]; bundleIds?: string[] }) {
  const requestIds = [...new Set((opts.requestIds ?? []).filter(Boolean))];
  const bundleIds = [...new Set((opts.bundleIds ?? []).filter(Boolean))];

  // Balíčky, do kterých dotčené žádanky patří.
  if (requestIds.length) {
    const vBalicku = await prisma.request.findMany({
      where: { id: { in: requestIds }, bundleId: { not: null } },
      select: { bundleId: true },
    });
    for (const r of vBalicku) if (r.bundleId) bundleIds.push(r.bundleId);
  }
  if (!requestIds.length && !bundleIds.length) return;

  await prisma.offerComparison
    .deleteMany({
      where: {
        OR: [
          ...(requestIds.length ? [{ requestId: { in: requestIds } }] : []),
          ...(bundleIds.length ? [{ bundleId: { in: [...new Set(bundleIds)] } }] : []),
        ],
      },
    })
    .catch(() => undefined);
}
