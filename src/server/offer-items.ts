import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import type { Prisma } from "@/generated/prisma/client";
import { AI_MODEL, aiAccountForProject, assertBudget, callModel, extractable, filePart } from "@/server/extraction";
import { dropComparisons } from "@/server/comparisons";
import { priceScores, totalScore, type ScoreKey } from "@/lib/offer-scores";

/**
 * Nabídky po položkách (#47).
 *
 * Společná nabídka na balíček nese jen celkovou cenu – ale rozhoduje se po
 * prvcích: který HS portál, za kolik, s jakými parametry. Rozpis přečte všechny
 * přílohy nabídky najednou a vrátí řádky: prvek, žádanka, výrobek, rozměr,
 * cena a technické údaje. Alternativy (jiné provedení téhož prvku) se do
 * součtu nepočítají.
 *
 * Kontrola: součet základních řádků se porovná s celkovou cenou nabídky.
 * Ceny po žádankách se do matice balíčku doplní jen tehdy, když součet sedí –
 * jinak by matice ukazovala čísla, která nikdo nenabídl.
 *
 * Rozbor výrobků k jedné žádance (ItemReview) se pouští na povel – hledá na
 * webu recenze a zkušenosti se systémem, proto stojí víc.
 */

const ITEMS_MODEL = process.env.AI_ITEMS_MODEL || AI_MODEL;
// Oprava rozpisu, který nesedí se součtem – stejný model, ale důkladnější čtení.
const ITEMS_RETRY_MODEL = process.env.AI_ITEMS_RETRY_MODEL || ITEMS_MODEL;
// Běh, který nedoběhl (restart serveru uprostřed volání), se po 25 min uzavře.
const STALE_MS = 25 * 60 * 1000;

export type OfferItemKind = "product" | "accessory" | "service" | "discount";
export type ItemSpec = { label: string; value: string };

type ExtractedItem = {
  requestId: string | null;
  kind: OfferItemKind;
  alternative: string | null;
  position: string | null;
  title: string;
  product: string | null;
  widthMm: number | null;
  heightMm: number | null;
  quantity: number | null;
  unit: string | null;
  unitPriceWithoutVat: number | null;
  priceWithoutVat: number | null;
  priceWithVat: number | null;
  specs: ItemSpec[];
  description: string | null;
  mismatch: string | null;
};
/** Podmínky nabídky – podklad pro známku za dodání a podmínky. */
export type OfferTerms = {
  leadTime: string | null;
  warranty: string | null;
  paymentTerms: string | null;
  validUntil: string | null;
  included: string[];
  excluded: string[];
};
type ItemsResult = {
  items: ExtractedItem[];
  terms: OfferTerms;
  totalWithoutVat: number | null;
  totalWithVat: number | null;
  vatRate: number | null;
  summary: string;
  warnings: string[];
};

/** Shrnutí rozpisu uložené u nabídky (BundleOffer.itemsInfo). */
export type ItemsInfo = {
  summary: string;
  warnings: string[];
  /** Součet základních řádků s DPH (bez alternativ). */
  sumWithVat: number;
  /** Celková cena nabídky, se kterou se porovnávalo. */
  offerTotal: number | null;
  /** sumWithVat − offerTotal; null = není s čím porovnat. */
  diff: number | null;
  /** Doplnily se ceny po žádankách do matice? */
  partsFilled: boolean;
  /** Chybí u rozpisů z doby před známkováním. */
  terms?: OfferTerms;
};

const n = { type: ["number", "null"] };
const str = { type: ["string", "null"] };
const strArr = { type: "array", items: { type: "string" } };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

const ITEMS_SCHEMA = obj({
  items: {
    type: "array",
    items: obj({
      requestId: str,
      kind: { type: "string", enum: ["product", "accessory", "service", "discount"] },
      alternative: str,
      position: str,
      title: { type: "string" },
      product: str,
      widthMm: n,
      heightMm: n,
      quantity: n,
      unit: str,
      unitPriceWithoutVat: n,
      priceWithoutVat: n,
      priceWithVat: n,
      specs: { type: "array", items: obj({ label: { type: "string" }, value: { type: "string" } }) },
      description: str,
      mismatch: str,
    }),
  },
  terms: obj({ leadTime: str, warranty: str, paymentTerms: str, validUntil: str, included: strArr, excluded: strArr }),
  totalWithoutVat: n,
  totalWithVat: n,
  vatRate: n,
  summary: { type: "string" },
  warnings: strArr,
});

const ITEMS_INSTRUCTIONS = `Jsi asistent stavebníka. Dostaneš všechny dokumenty jedné cenové nabídky (může jich být víc – nabídka, technické listy, e-mail) a seznam poptávek. Vypiš nabídku po položkách, česky.
Jedna položka = jeden řádek nabídky / jedna pozice (okno, dveře, HS portál, parapet, montáž, doprava, sleva…). Nic nesčítej dohromady a nic nevynechávej.
Součet základních položek (bez alternativ, se slevami) musí dát celkovou cenu nabídky. Proto:
- rekapitulaci, mezisoučty a „celkem" nevypisuj jako položky,
- slevu vypiš jako samostatnou položku jen tehdy, když ještě není promítnutá v cenách položek; je-li cena položky uvedená po slevě, ber ji a slevu nepřidávej,
- alternativa je jen to, co dokument výslovně uvádí jako volitelné nebo nezapočtené do celkové ceny; montáž či doprava započtená v celkové ceně alternativou není,
- u položek účtovaných za metr nebo m² je cena řádku = jednotková cena × množství.
- requestId: poptávka ze seznamu, ke které prvek patří (okno ložnice → "Okna patro"). Parapety, žaluzie a příslušenství konkrétního prvku patří k jeho poptávce. Montáž, doprava, zaměření, demontáž a likvidace pro celou nabídku → null. Nikdy si id nevymýšlej.
- kind: "product" = hlavní prvek (okno, dveře, portál), "accessory" = příslušenství a příplatky (parapet, sítě, žaluzie, kování navíc), "service" = práce a doprava, "discount" = sleva (ceny záporně).
- alternative: když nabídka u téhož prvku dává víc provedení (jiný profil, jiné zasklení, varianta A/B, „alternativně"), základní provedení má null a každá další varianta krátký název, např. "Varianta B – Aluplast Ideal 8000". Když je celá nabídka ve dvou variantách se dvěma součty, první je základní (null) a druhá alternativa. Alternativy se nesčítají do celkové ceny.
- position: číslo pozice v nabídce (např. "P3", "3"), jinak null.
- title: krátce co to je a kde, např. "HS portál obývák", "Okno koupelna".
- product: výrobce + systém/typ, např. "Salamander bluEvolution 82, HS", "Schüco LivIngSlide".
- widthMm, heightMm: rozměr v mm (šířka × výška). quantity + unit (ks, bm, m²).
- unitPriceWithoutVat: cena za kus bez DPH; priceWithoutVat a priceWithVat: cena řádku celkem. Uveď, co dokument uvádí; když uvádí jen bez DPH, priceWithVat nech null (dopočítá se). Když je u položky sleva, ber cenu po slevě.
- specs: technické parametry prvku jako dvojice label/value, krátce: Profil, Stavební hloubka, Počet komor, Uw, Ug, Zasklení, Rámeček skla, Barva, Kování, Otevírání, Práh, Bezpečnost, Hluk (Rw), Záruka… Jen co v dokumentech opravdu je. Parametry společné celé nabídce (profil platí pro všechna okna) uveď u každého prvku, kterého se týkají.
- description: 1 věta, co dalšího je důležité (dělení, kliky, barva z obou stran) nebo null.
- mismatch: porovnej se specifikací poptávky (rozměr, počet, provedení). Rozpor jednou větou, např. "poptávka 2570 × 2050 mm, nabídka 2500 × 2050 mm", jinak null.
totalWithoutVat, totalWithVat: celková cena nabídky (základní varianta) tak, jak ji dokument uvádí. vatRate: sazba DPH v % (12 nebo 21), jinak null.
terms: podmínky nabídky – leadTime (dodací lhůta textem, např. "8–10 týdnů od zaměření"), warranty (záruka na okna/kování/montáž), paymentTerms (záloha, splatnost), validUntil (platnost nabídky YYYY-MM-DD), included (co je v ceně: montáž, doprava, demontáž, likvidace, parapety, zednické zapravení…), excluded (co výslovně v ceně není). Neuvedené = null / prázdné pole.
summary: 1–2 věty – co nabídka obsahuje, co je v ceně (montáž, doprava) a co ne.
warnings: nejasnosti – nečitelná cena, součet položek nesedí s celkem, chybí montáž, položka bez ceny.
Čísla bez mezer, desetinná tečka.`;

const REVIEW_SCHEMA = obj({
  headline: { type: "string" },
  items: {
    type: "array",
    items: obj({
      ref: { type: "string" },
      verdict: { type: "string" },
      pros: strArr,
      cons: strArr,
      reviews: { type: "string" },
      sources: strArr,
      priceNote: { type: "string" },
      scores: obj({
        technical: n,
        reviews: n,
        vendor: n,
        terms: n,
        match: n,
      }),
      scoreNotes: obj({
        technical: { type: "string" },
        reviews: { type: "string" },
        vendor: { type: "string" },
        terms: { type: "string" },
        match: { type: "string" },
      }),
    }),
  },
  recommendation: { type: "string" },
  questions: strArr,
});

export type ItemReviewResult = {
  headline: string;
  items: {
    /** id položky (OfferItem.id). */
    ref: string;
    verdict: string;
    pros: string[];
    cons: string[];
    /** Co se o výrobku/systému našlo – nebo „nenalezeno“. */
    reviews: string;
    sources: string[];
    priceNote: string;
    /** Dílčí známky 0–5 od rozboru; null = nedá se posoudit. */
    scores: Partial<Record<ScoreKey, number | null>>;
    scoreNotes: Partial<Record<ScoreKey, string>>;
    /** Celkové skóre 0–100 (dopočítá aplikace). Chybí u starších rozborů. */
    total?: number | null;
  }[];
  recommendation: string;
  questions: string[];
};

const REVIEW_INSTRUCTIONS = `Jsi nezávislý poradce stavebníka. Dostaneš všechny nabídnuté prvky k jedné poptávce (např. všechny HS portály ze všech nabídek včetně alternativ) s parametry a cenami. Odpovídej česky, stručně a věcně.
Ke každému prvku (ref = jeho id, beze změny) vrať:
- verdict: jedna věta – pro koho/kdy je to dobrá volba,
- pros, cons: 1–3 body, konkrétně z parametrů (Uw, profil, práh, kování, zasklení) a z toho, co jsi našel,
- reviews: co se o výrobku nebo systému dá **doložit** z webu (zkušenosti, testy, typické problémy, servis). Ke každému tvrzení zdroj (doména) do sources. Když nic použitelného nenajdeš, napiš přesně „nenalezeno“ a sources nech prázdné. **Nikdy si nevymýšlej** hodnocení, počty recenzí ani výsledky testů,
- priceNote: cena proti ostatním prvkům v tomhle srovnání – hlavně Kč/m² – a co je/není v ceně.
- scores: známky 0–5 (5 = nejlepší, celá čísla), vždy relativně k ostatním prvkům v tomhle srovnání. Cenu neznámkuj, tu spočítá aplikace.
  technical = technické parametry (Uw/Ug, profil, stavební hloubka, kování, práh, bezpečnost),
  reviews = zkušenosti a recenze výrobku/systému z webu; když nic nenajdeš, null (ne nula),
  vendor = firma: doložitelná pověst z webu, délka působení, servis; když nic nenajdeš, null,
  terms = dodání a podmínky: dodací lhůta, záruka, co je v ceně (montáž, doprava, demontáž), zálohy, platnost,
  match = soulad se zadáním poptávky (rozměr, provedení); rozpor snižuje.
  Co nejde posoudit, je null. Známky nevymýšlej, raději null.
- scoreNotes: ke každé známce půl věty proč (u null proč se nedá posoudit).
recommendation: 3–5 vět – který prvek vybrat a proč, včetně kompromisu cena × parametry. Upozorni, když se prvky nedají férově srovnat (jiný rozměr, jiný typ otevírání, chybí montáž).
questions: co si ověřit u dodavatelů před objednáním (max 5).
headline: jedna věta shrnutí.
Pokyn uživatele má přednost.`;

const num = (v: unknown) => (v == null ? null : Number(v));
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Plocha prvku v m² (rozměr × počet), nebo null. */
export function itemArea(i: { widthMm: number | null; heightMm: number | null; quantity: number | null }) {
  if (!i.widthMm || !i.heightMm) return null;
  return ((i.widthMm * i.heightMm) / 1_000_000) * (i.quantity && i.quantity > 0 ? i.quantity : 1);
}

// ---------------------------------------------------------------------------
// Rozpis položek
// ---------------------------------------------------------------------------

/** Spustitelné? Ověří přílohy, rozpočet a že už neběží. Vrací projekt (plátce). */
export async function prepareOfferItems(bundleOfferId: string) {
  const o = await prisma.bundleOffer.findUnique({
    where: { id: bundleOfferId },
    select: {
      id: true,
      itemsStatus: true,
      itemsAt: true,
      bundle: { select: { projectId: true } },
      documents: { select: { originalName: true, mimeType: true } },
    },
  });
  if (!o) throw new Error("Nabídka nenalezena.");
  if (!o.documents.some((d) => extractable(d.mimeType, d.originalName)))
    throw new Error("Nabídka nemá přílohu, kterou jde přečíst.");
  const stale = o.itemsAt && Date.now() - o.itemsAt.getTime() > STALE_MS;
  if (o.itemsStatus === "running" && !stale) throw new Error("Rozpis už běží.");
  await assertBudget(await aiAccountForProject(o.bundle.projectId));
  await prisma.bundleOffer.update({
    where: { id: o.id },
    data: { itemsStatus: "running", itemsError: null, itemsAt: new Date() },
  });
  return o.bundle.projectId;
}

export async function runOfferItems(bundleOfferId: string) {
  try {
    const o = await prisma.bundleOffer.findUnique({
      where: { id: bundleOfferId },
      select: {
        id: true,
        bundleId: true,
        vendorId: true,
        vendorName: true,
        status: true,
        createdById: true,
        price: true,
        priceWithoutVat: true,
        note: true,
        vendor: { select: { name: true } },
        bundle: { select: { projectId: true, name: true } },
        documents: {
          select: { fileName: true, originalName: true, mimeType: true, note: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!o) return;
    const requests = await prisma.request.findMany({
      where: { bundleId: o.bundleId },
      select: { id: true, title: true, description: true, quantity: true, unit: true },
      orderBy: { createdAt: "asc" },
    });

    const parts = [];
    const notes: string[] = [];
    for (const d of o.documents) {
      if (!extractable(d.mimeType, d.originalName)) continue;
      parts.push(await filePart(await storage.read(d.fileName), d.originalName, d.mimeType));
      if (d.note) notes.push(`${d.originalName}: ${d.note}`);
    }
    if (!parts.length) throw new Error("Nabídka nemá přílohu, kterou jde přečíst.");

    const reqList = requests.map((r) => ({
      requestId: r.id,
      title: r.title,
      specification: r.description,
      quantity: r.quantity != null ? `${Number(r.quantity)} ${r.unit}` : null,
    }));
    const account = await aiAccountForProject(o.bundle.projectId);
    const intro: { type: "input_text"; text: string } = {
      type: "input_text",
      text:
        `Firma: ${o.vendor?.name ?? o.vendorName ?? "neuvedeno"}\n` +
        `Poptávky (balíček „${o.bundle.name}“):\n${JSON.stringify(reqList, null, 1)}` +
        (notes.length ? `\n\nPoznámky uživatele k dokumentům:\n${notes.join("\n")}` : "") +
        (o.note ? `\n\nPoznámka k nabídce: ${o.note}` : ""),
    };
    const offerPrice = num(o.price);
    const offerNoVat = num(o.priceWithoutVat);
    const known = new Set(requests.map((r) => r.id));

    /** Výsledek modelu → řádky k uložení + kontrola součtu. */
    const zpracuj = (data: ItemsResult) => {
      // DPH: poměr z nabídky, jinak z dokumentu, jinak sazba, jinak 21 %.
      const ratio =
        offerPrice && offerNoVat
          ? offerPrice / offerNoVat
          : data.totalWithVat && data.totalWithoutVat
            ? data.totalWithVat / data.totalWithoutVat
            : data.vatRate
              ? 1 + data.vatRate / 100
              : 1.21;
      const rows = data.items
        .filter((i) => i.title?.trim())
        .map((i, idx) => {
          let noVat = i.priceWithoutVat;
          if (noVat == null && i.unitPriceWithoutVat != null) noVat = i.unitPriceWithoutVat * (i.quantity ?? 1);
          let withVat = i.priceWithVat;
          if (withVat == null && noVat != null) withVat = noVat * ratio;
          if (noVat == null && withVat != null) noVat = withVat / ratio;
          if (i.kind === "discount") {
            if (noVat != null) noVat = -Math.abs(noVat);
            if (withVat != null) withVat = -Math.abs(withVat);
          }
          return {
            bundleOfferId: o.id,
            requestId: i.requestId && known.has(i.requestId) ? i.requestId : null,
            kind: i.kind,
            alternative: i.alternative?.trim() || null,
            position: i.position?.trim() || null,
            title: i.title.trim().slice(0, 200),
            product: i.product?.trim() || null,
            widthMm: i.widthMm ? Math.round(i.widthMm) : null,
            heightMm: i.heightMm ? Math.round(i.heightMm) : null,
            quantity: i.quantity,
            unit: i.unit?.trim() || null,
            unitPrice: i.unitPriceWithoutVat != null ? round2(i.unitPriceWithoutVat) : null,
            priceWithoutVat: noVat != null ? round2(noVat) : null,
            priceWithVat: withVat != null ? round2(withVat) : null,
            specs: (i.specs ?? []).filter((x) => x.label && x.value) as unknown as Prisma.InputJsonValue,
            description: i.description?.trim() || null,
            mismatch: i.mismatch?.trim() || null,
            sortOrder: idx,
          };
        });
      // Kontrola součtu (jen základní provedení, bez alternativ).
      const base = rows.filter((r) => !r.alternative);
      const sumWithVat = round2(base.reduce((a, r) => a + (r.priceWithVat ?? 0), 0));
      const sumNoVat = round2(base.reduce((a, r) => a + (r.priceWithoutVat ?? 0), 0));
      const offerTotal = offerPrice ?? data.totalWithVat ?? (data.totalWithoutVat ? data.totalWithoutVat * ratio : null);
      const diff = offerTotal != null ? round2(sumWithVat - offerTotal) : null;
      const sedi = diff != null && Math.abs(diff) <= Math.max(50, Math.abs(offerTotal ?? 0) * 0.01);
      return { data, rows, base, sumWithVat, sumNoVat, offerTotal, diff, sedi };
    };

    const prvni = await callModel<ItemsResult>(ITEMS_MODEL, ITEMS_INSTRUCTIONS, [intro, ...parts], "offer_items", ITEMS_SCHEMA, {
      effort: "low",
      maxOutput: 24_000,
      account,
    });
    let costUsd = prvni.costUsd;
    let vysledek = zpracuj(prvni.data);

    // Součet nesedí → jedna oprava se zpětnou vazbou a důkladnějším čtením.
    // Typické chyby: souhrnná sleva odečtená podruhé, započtená položka označená
    // jako alternativa, cena za m/m² brána jako celková, ceny s a bez DPH.
    if (!vysledek.sedi && vysledek.offerTotal != null) {
      try {
        const oprava = await callModel<ItemsResult>(
          ITEMS_RETRY_MODEL,
          ITEMS_INSTRUCTIONS,
          [
            intro,
            ...parts,
            {
              type: "input_text",
              text:
                `KONTROLA: tvůj předchozí rozpis nesedí s cenou nabídky. Součet základních položek (bez alternativ) vyšel ` +
                `${Math.round(vysledek.sumNoVat)} Kč bez DPH / ${Math.round(vysledek.sumWithVat)} Kč s DPH, ` +
                `nabídka uvádí celkem ${offerNoVat != null ? `${Math.round(offerNoVat)} Kč bez DPH / ` : ""}${Math.round(vysledek.offerTotal)} Kč s DPH.\n` +
                `Projdi dokumenty znovu a najdi chybu. Časté příčiny: sleva nebo souhrn z rekapitulace, který už je promítnutý v cenách položek, odečtený/přičtený podruhé; ` +
                `položka, která v ceně je, chybně označená jako alternativa (nebo naopak); cena za kus, metr či m² vzatá jako celková; ` +
                `mezisoučet nebo rekapitulace vypsaná jako položka; ceny s DPH a bez DPH zaměněné; chybějící pozice. ` +
                `Vrať kompletní opravený rozpis tak, aby součet základních položek odpovídal celkové ceně. ` +
                `Když rozdíl opravdu nejde vysvětlit, vrať nejlepší rozpis a důvod napiš do warnings.\n\n` +
                `Předchozí rozpis:\n${JSON.stringify(prvni.data.items.map((i) => ({ kind: i.kind, alternative: i.alternative, title: i.title, quantity: i.quantity, unitPriceWithoutVat: i.unitPriceWithoutVat, priceWithoutVat: i.priceWithoutVat, priceWithVat: i.priceWithVat })))}`,
            },
          ],
          "offer_items_fix",
          ITEMS_SCHEMA,
          { effort: "medium", maxOutput: 32_000, account },
        );
        costUsd += oprava.costUsd;
        const druhy = zpracuj(oprava.data);
        if (druhy.diff != null && Math.abs(druhy.diff) < Math.abs(vysledek.diff ?? Infinity)) vysledek = druhy;
      } catch {
        // Oprava je bonus – když selže (limit, výpadek), platí první rozpis.
      }
    }
    const { data, rows, base, sumWithVat, offerTotal, diff, sedi } = vysledek;

    await prisma.$transaction([
      prisma.offerItem.deleteMany({ where: { bundleOfferId: o.id } }),
      prisma.offerItem.createMany({ data: rows }),
    ]);

    // Ceny po žádankách do matice: prvky žádanky + poměrný díl společných
    // položek (montáž, doprava, sleva), ať části dají dohromady celek.
    let partsFilled = false;
    if (sedi) {
      const byReq = new Map<string, number>();
      for (const r of base) if (r.requestId) byReq.set(r.requestId, (byReq.get(r.requestId) ?? 0) + (r.priceWithVat ?? 0));
      const shared = base.filter((r) => !r.requestId).reduce((a, r) => a + (r.priceWithVat ?? 0), 0);
      const reqSum = [...byReq.values()].reduce((a, x) => a + x, 0);
      if (reqSum > 0) {
        const existing = await prisma.offer.findMany({
          where: { bundleOfferId: o.id },
          select: { id: true, requestId: true, price: true },
        });
        for (const [requestId, sum] of byReq) {
          const price = Math.round(sum + (shared * sum) / reqSum);
          const part = existing.find((p) => p.requestId === requestId);
          if (part) {
            // Cenu zadanou ručně nepřepisovat.
            if (part.price == null) await prisma.offer.update({ where: { id: part.id }, data: { price } });
          } else {
            await prisma.offer.create({
              data: {
                requestId,
                bundleOfferId: o.id,
                vendorId: o.vendorId,
                vendorName: o.vendorName,
                price,
                status: o.status,
                createdById: o.createdById,
              },
            });
          }
        }
        partsFilled = true;
      }
    }

    const warnings = [...(data.warnings ?? [])];
    if (diff != null && !sedi)
      warnings.unshift(
        `Součet položek (${Math.round(sumWithVat)} Kč) nesedí s cenou nabídky (${Math.round(offerTotal!)} Kč) – ceny po žádankách se nedoplnily.`,
      );
    const info: ItemsInfo = { summary: data.summary, warnings, sumWithVat, offerTotal, diff, partsFilled, terms: data.terms };
    await prisma.bundleOffer.update({
      where: { id: o.id },
      data: {
        itemsStatus: "ready",
        itemsInfo: info as unknown as Prisma.InputJsonValue,
        itemsCostUsd: costUsd,
        itemsAt: new Date(),
      },
    });
    await dropComparisons({ bundleIds: [o.bundleId] });
  } catch (err) {
    await prisma.bundleOffer
      .update({
        where: { id: bundleOfferId },
        data: { itemsStatus: "error", itemsError: err instanceof Error ? err.message.slice(0, 500) : "Neznámá chyba" },
      })
      .catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Rozbor výrobků k žádance
// ---------------------------------------------------------------------------

export async function createItemReview(requestId: string, userId: string, prompt?: string | null) {
  const rq = await prisma.request.findUnique({ where: { id: requestId }, select: { projectId: true } });
  if (!rq) throw new Error("Žádanka nenalezena.");
  const count = await prisma.offerItem.count({ where: { requestId } });
  if (!count) throw new Error("K žádance zatím nejsou rozepsané položky.");
  await assertBudget(await aiAccountForProject(rq.projectId));
  const busy = await prisma.itemReview.findFirst({
    where: { requestId, status: "running", createdAt: { gte: new Date(Date.now() - STALE_MS) } },
    select: { id: true },
  });
  if (busy) throw new Error("Rozbor už běží.");
  const r = await prisma.itemReview.create({
    data: { requestId, prompt: prompt?.trim() || null, model: AI_MODEL, createdById: userId },
    select: { id: true },
  });
  return r.id;
}

export async function runItemReview(reviewId: string) {
  try {
    const rv = await prisma.itemReview.findUnique({
      where: { id: reviewId },
      select: { id: true, requestId: true, prompt: true, model: true },
    });
    if (!rv) return;
    const rq = await prisma.request.findUnique({
      where: { id: rv.requestId },
      select: { projectId: true, title: true, description: true, quantity: true, unit: true },
    });
    if (!rq) return;
    const items = await prisma.offerItem.findMany({
      where: { requestId: rv.requestId },
      orderBy: [{ bundleOfferId: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        bundleOfferId: true,
        kind: true,
        alternative: true,
        title: true,
        product: true,
        widthMm: true,
        heightMm: true,
        quantity: true,
        unit: true,
        priceWithVat: true,
        specs: true,
        description: true,
        mismatch: true,
        bundleOffer: {
          select: { vendorName: true, deliveryDate: true, itemsInfo: true, vendor: { select: { name: true } } },
        },
      },
    });
    // Známkují se hlavní prvky; příslušenství jde k firmě jako kontext.
    const accessories = items.filter((i) => i.kind !== "product");
    items.splice(0, items.length, ...items.filter((i) => i.kind === "product"));
    if (!items.length) throw new Error("K žádance nejsou rozepsané žádné hlavní prvky.");
    // Co je u firmy v ceně navíc (montáž, doprava) – kvůli férovému srovnání.
    const offerIds = [...new Set(items.map((i) => i.bundleOfferId))];
    const shared = await prisma.offerItem.findMany({
      where: { bundleOfferId: { in: offerIds }, requestId: null, alternative: null },
      select: { bundleOfferId: true, title: true, priceWithVat: true },
    });
    const firmy = offerIds.map((id) => {
      const it = items.find((i) => i.bundleOfferId === id)!;
      const info = it.bundleOffer.itemsInfo as unknown as ItemsInfo | null;
      return {
        firma: it.bundleOffer.vendor?.name ?? it.bundleOffer.vendorName ?? "?",
        podminky: info?.terms ?? null,
        terminDodani: it.bundleOffer.deliveryDate?.toISOString().slice(0, 10) ?? null,
        prislusenstviKTetoPoptavce: accessories
          .filter((a) => a.bundleOfferId === id)
          .map((a) => `${a.title}${a.alternative ? ` (${a.alternative})` : ""}: ${a.priceWithVat != null ? Math.round(Number(a.priceWithVat)) + " Kč" : "bez ceny"}`),
        spolecnePolozky: shared
          .filter((s) => s.bundleOfferId === id)
          .map((s) => `${s.title}: ${s.priceWithVat != null ? Math.round(Number(s.priceWithVat)) + " Kč" : "bez ceny"}`),
      };
    });
    const list = items.map((i) => {
      const plocha = itemArea({ widthMm: i.widthMm, heightMm: i.heightMm, quantity: num(i.quantity) });
      const cena = num(i.priceWithVat);
      return {
        ref: i.id,
        firma: i.bundleOffer.vendor?.name ?? i.bundleOffer.vendorName ?? "?",
        alternativa: i.alternative,
        druh: i.kind,
        prvek: i.title,
        vyrobek: i.product,
        rozmer: i.widthMm && i.heightMm ? `${i.widthMm} × ${i.heightMm} mm` : null,
        pocet: i.quantity != null ? `${Number(i.quantity)} ${i.unit ?? ""}`.trim() : null,
        cenaSDph: cena != null ? Math.round(cena) : null,
        kcZaM2: cena != null && plocha ? Math.round(cena / plocha) : null,
        parametry: i.specs,
        popis: i.description,
        rozporSeZadanim: i.mismatch,
      };
    });

    const { data, costUsd } = await callModel<ItemReviewResult>(
      rv.model,
      REVIEW_INSTRUCTIONS,
      [
        {
          type: "input_text",
          text:
            `Poptávka: ${rq.title}` +
            (rq.description ? `\nSpecifikace: ${rq.description}` : "") +
            (rq.quantity != null ? `\nMnožství: ${Number(rq.quantity)} ${rq.unit}` : "") +
            `\n\nNabídnuté prvky:\n${JSON.stringify(list, null, 1)}` +
            `\n\nFirmy – podmínky, příslušenství a společné položky (montáž, doprava…):\n${JSON.stringify(firmy, null, 1)}` +
            (rv.prompt ? `\n\nPokyn uživatele: ${rv.prompt}` : ""),
        },
      ],
      "item_review",
      REVIEW_SCHEMA,
      { effort: "low", maxOutput: 14_000, webSearch: true, account: await aiAccountForProject(rq.projectId) },
    );
    const ids = new Set(items.map((i) => i.id));
    data.items = data.items.filter((x) => ids.has(x.ref));
    // Cena se známkuje z čísel, celkové skóre z vah – ne odhadem modelu.
    const ceny = priceScores(list.map((l) => ({ id: l.ref, price: l.cenaSDph, perM2: l.kcZaM2 })));
    for (const x of data.items) {
      x.scores = { ...x.scores, price: ceny[x.ref] ?? null };
      x.total = totalScore(x.scores);
    }
    await prisma.itemReview.update({
      where: { id: rv.id },
      data: { status: "ready", result: data as unknown as Prisma.InputJsonValue, costUsd },
    });
  } catch (err) {
    await prisma.itemReview
      .update({
        where: { id: reviewId },
        data: { status: "error", error: err instanceof Error ? err.message.slice(0, 500) : "Neznámá chyba" },
      })
      .catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Pro stránku: položky balíčku po žádankách
// ---------------------------------------------------------------------------

export type ItemView = {
  id: string;
  bundleOfferId: string;
  vendor: string;
  kind: string;
  alternative: string | null;
  position: string | null;
  title: string;
  product: string | null;
  widthMm: number | null;
  heightMm: number | null;
  quantity: number | null;
  unit: string | null;
  priceWithVat: number | null;
  priceWithoutVat: number | null;
  perM2: number | null;
  specs: ItemSpec[];
  description: string | null;
  mismatch: string | null;
  selectedOffer: boolean;
};

export type ItemReviewView = {
  id: string;
  status: string;
  error: string | null;
  createdAt: string;
  result: ItemReviewResult | null;
} | null;

/** Položky všech nabídek balíčku + poslední rozbor u každé žádanky. */
export async function bundleItemsView(bundleId: string, requestIds: string[]) {
  const [items, reviews] = await Promise.all([
    prisma.offerItem.findMany({
      where: { bundleOffer: { bundleId } },
      orderBy: [{ sortOrder: "asc" }],
      select: {
        id: true,
        bundleOfferId: true,
        requestId: true,
        kind: true,
        alternative: true,
        position: true,
        title: true,
        product: true,
        widthMm: true,
        heightMm: true,
        quantity: true,
        unit: true,
        priceWithVat: true,
        priceWithoutVat: true,
        specs: true,
        description: true,
        mismatch: true,
        bundleOffer: { select: { vendorName: true, selected: true, vendor: { select: { name: true } } } },
      },
    }),
    requestIds.length
      ? prisma.itemReview.findMany({
          where: { requestId: { in: requestIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["requestId"],
          select: { id: true, requestId: true, status: true, error: true, createdAt: true, result: true },
        })
      : Promise.resolve([]),
  ]);

  const view = (i: (typeof items)[number]): ItemView => {
    const quantity = num(i.quantity);
    const priceWithVat = num(i.priceWithVat);
    const area = itemArea({ widthMm: i.widthMm, heightMm: i.heightMm, quantity });
    return {
      id: i.id,
      bundleOfferId: i.bundleOfferId,
      vendor: i.bundleOffer.vendor?.name ?? i.bundleOffer.vendorName ?? "Dodavatel neurčen",
      kind: i.kind,
      alternative: i.alternative,
      position: i.position,
      title: i.title,
      product: i.product,
      widthMm: i.widthMm,
      heightMm: i.heightMm,
      quantity,
      unit: i.unit,
      priceWithVat,
      priceWithoutVat: num(i.priceWithoutVat),
      perM2: priceWithVat != null && area && i.kind === "product" ? Math.round(priceWithVat / area) : null,
      specs: Array.isArray(i.specs) ? (i.specs as unknown as ItemSpec[]) : [],
      description: i.description,
      mismatch: i.mismatch,
      selectedOffer: i.bundleOffer.selected,
    };
  };

  const byRequest: Record<string, ItemView[]> = {};
  const shared: ItemView[] = [];
  for (const i of items) {
    if (i.requestId) (byRequest[i.requestId] ??= []).push(view(i));
    else shared.push(view(i));
  }
  const reviewByRequest: Record<string, ItemReviewView> = {};
  for (const r of reviews)
    reviewByRequest[r.requestId] = {
      id: r.id,
      status: r.status,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
      result: r.result as unknown as ItemReviewResult | null,
    };
  return { byRequest, shared, reviewByRequest };
}
