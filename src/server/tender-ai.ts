import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { AI_MODEL, aiAccountForProject, assertBudget, callModel } from "@/server/extraction";
import { fetchAres } from "@/server/doc-scan";
import { offerFieldsToText, readOfferFields, type OfferField } from "@/server/tenders";

/**
 * Návrh k poptávkovému řízení (#49): z popisu zadání navrhne údaje, které
 * mají dodavatelé vyplnit, kritéria výběru, nejasnosti v zadání a seznam
 * dodavatelů v okolí s kontakty a veřejným hodnocením (s uvedením zdroje).
 * IČO navržených firem se ověří v ARES – nevymyšlená firma = nalezená v ARES.
 */

export type TenderSuggestion = {
  requests: {
    requestId: string;
    offerFields: OfferField[];
    gaps: string[];
  }[];
  criteria: { label: string; weight: number; note: string }[];
  vendors: {
    name: string;
    ico: string | null;
    web: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    rating: number | null;
    ratingCount: number | null;
    ratingSource: string | null;
    references: string | null;
    why: string;
    requestIds: string[];
    // doplněno po ověření
    aresName?: string | null;
    aresOk?: boolean;
    vendorId?: string | null;
  }[];
  note: string | null;
};

const nstr = { type: ["string", "null"] };
const nnum = { type: ["number", "null"] };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["requests", "criteria", "vendors", "note"],
  properties: {
    requests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requestId", "offerFields", "gaps"],
        properties: {
          requestId: { type: "string" },
          offerFields: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "unit", "required"],
              properties: { label: { type: "string" }, unit: nstr, required: { type: "boolean" } },
            },
          },
          gaps: { type: "array", items: { type: "string" } },
        },
      },
    },
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "weight", "note"],
        properties: { label: { type: "string" }, weight: { type: "number" }, note: { type: "string" } },
      },
    },
    vendors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "ico", "web", "email", "phone", "city", "rating", "ratingCount", "ratingSource", "references", "why", "requestIds"],
        properties: {
          name: { type: "string" },
          ico: nstr,
          web: nstr,
          email: nstr,
          phone: nstr,
          city: nstr,
          rating: nnum,
          ratingCount: nnum,
          ratingSource: nstr,
          references: nstr,
          why: { type: "string" },
          requestIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    note: nstr,
  },
};

const INSTRUCTIONS = `Pomáháš soukromému stavebníkovi v Česku připravit poptávkové řízení. Dostaneš zadání (položky se specifikací) a místo stavby. Odpovídej česky.

1) requests – ke každé položce (requestId přesně podle vstupu):
- offerFields: 4–8 údajů, které má dodavatel v nabídce vyplnit, aby šly nabídky férově porovnat (technologie/výrobek, klíčové technické parametry s jednotkou, tloušťka, záruka, termín realizace, co je v ceně – doprava, příprava, úklid…). Krátké popisky, jednotku zvlášť do unit (např. "mm", "W/m²K", "roky"). required=true jen u 2–3 nejdůležitějších. Neopakuj cenu a termín dodání – ty formulář má vždy.
- gaps: co v zadání chybí nebo je nejasné a dodavatel se na to zeptá (rozsah v m², přístup, podklad…). Krátce, max 5.

2) criteria: 3–6 kritérií výběru s vahou v procentech (součet 100) a krátkou poznámkou – cena, kvalita/technologie, reference, termín, záruka…

3) vendors: vyhledej na webu 6–12 skutečných firem, které tuto práci dělají v dojezdu místa stavby (přednostně do 50 km). U každé:
- name, ico (8 číslic – dohledej na webu firmy nebo v obchodním rejstříku; když nenajdeš, null), web, email a phone z webu firmy (nevymýšlej – když na webu nejsou, null), city.
- rating a ratingCount z veřejných recenzí (Google, Firmy.cz, Seznam…) a ratingSource = odkud (např. "Google", "Firmy.cz"); když nenajdeš, null.
- references: jednou větou doložitelné reference nebo specializace (např. "stříkaná PUR izolace podkroví RD, Icynene").
- why: proč ji navrhuješ, jednou větou.
- requestIds: na které položky se hodí.
Uváděj jen firmy, které jsi na webu skutečně našel. Firmy, které už jsou v evidenci uživatele (seznam níže), zahrň taky, pokud se hodí – použij stejný název a IČO.

note: jedna věta k trhu (např. obvyklá cena za m², sezónnost), nebo null.`;

/** Odkazy na zdroje, které model vkládá do textu: „([web](https://…))“. */
function cisty(t: string | null | undefined): string | null {
  if (!t) return t ?? null;
  return (
    t
      .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim() || null
  );
}
const bezUtm = (u: string | null) => (u ? u.replace(/[?&]utm_[^&#]*/g, "").replace(/\?$/, "") : u);

/** Spustí návrh (volá se v after()). Stav a výsledek ukládá do řízení. */
export async function runTenderSuggest(tenderId: string) {
  const t = await prisma.tender.findUnique({
    where: { id: tenderId },
    select: {
      id: true,
      title: true,
      intro: true,
      location: true,
      aiPrompt: true,
      projectId: true,
      project: { select: { ownerId: true } },
      requests: {
        orderBy: { sortOrder: "asc" },
        select: { request: { select: { id: true, title: true, description: true, quantity: true, unit: true, offerFields: true } } },
      },
    },
  });
  if (!t) return;
  try {
    const account = await aiAccountForProject(t.projectId);
    await assertBudget(account);
    const known = await prisma.vendor.findMany({
      where: { ownerId: t.project.ownerId },
      select: { name: true, ico: true, email: true, category: true },
      take: 300,
    });
    const zadani = t.requests
      .map(({ request: r }) => {
        const f = readOfferFields(r.offerFields);
        return `- requestId: ${r.id}\n  Položka: ${r.title}${r.quantity != null ? ` (${Number(r.quantity)} ${r.unit})` : ""}\n  Specifikace: ${r.description ?? "—"}${f.length ? `\n  Už požadované údaje: ${offerFieldsToText(f).replace(/\n/g, "; ")}` : ""}`;
      })
      .join("\n");
    const text =
      `Řízení: ${t.title}\nMísto stavby: ${t.location ?? "neuvedeno"}` +
      (t.intro ? `\nÚvod pro dodavatele: ${t.intro}` : "") +
      (t.aiPrompt ? `\nUpřesnění od stavebníka: ${t.aiPrompt}` : "") +
      `\n\nPoložky:\n${zadani}` +
      `\n\nDodavatelé v evidenci (název · IČO · e-mail):\n${known.map((v) => `${v.name} · ${v.ico ?? "—"} · ${v.email ?? "—"}`).join("\n")}`;

    const { data, costUsd } = await callModel<TenderSuggestion>(
      AI_MODEL,
      INSTRUCTIONS,
      [{ type: "input_text", text }],
      "tender_suggest",
      SCHEMA,
      { effort: "medium", maxOutput: 24_000, webSearch: true, account },
    );

    // Ověření: IČO v ARES, shoda s evidencí, platné žádanky.
    const validIds = new Set(t.requests.map((r) => r.request.id));
    data.requests = (data.requests ?? [])
      .filter((r) => validIds.has(r.requestId))
      .map((r) => ({ ...r, gaps: r.gaps.map((g) => cisty(g) ?? "").filter(Boolean) }));
    data.note = cisty(data.note);
    data.criteria = (data.criteria ?? []).map((c) => ({ ...c, note: cisty(c.note) ?? "" }));
    const evid = await prisma.vendor.findMany({
      where: { ownerId: t.project.ownerId },
      select: { id: true, ico: true, email: true, name: true },
    });
    const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    data.vendors = await Promise.all(
      (data.vendors ?? []).slice(0, 15).map(async (v) => {
        const ico = (v.ico ?? "").replace(/\D/g, "");
        const ares = ico.length === 8 ? await fetchAres(ico) : null;
        const email = v.email?.trim().toLowerCase() || null;
        const hit = evid.find(
          (e) =>
            (ico && e.ico?.replace(/\D/g, "") === ico) ||
            (email && e.email?.toLowerCase() === email) ||
            norm(e.name) === norm(v.name),
        );
        return {
          ...v,
          web: bezUtm(v.web),
          city: cisty(v.city),
          references: cisty(v.references),
          why: cisty(v.why) ?? "",
          ico: ico.length === 8 ? ico : null,
          email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
          requestIds: (v.requestIds ?? []).filter((id) => validIds.has(id)),
          aresName: ares?.name ?? null,
          aresOk: !!ares?.name,
          vendorId: hit?.id ?? null,
        };
      }),
    );

    await prisma.tender.update({
      where: { id: t.id },
      data: {
        aiStatus: "ready",
        aiError: null,
        aiResult: data as unknown as Prisma.InputJsonValue,
        aiCostUsd: costUsd,
        aiAt: new Date(),
      },
    });
  } catch (e) {
    await prisma.tender
      .update({
        where: { id: t.id },
        data: { aiStatus: "error", aiError: e instanceof Error ? e.message.slice(0, 500) : "Návrh se nepovedl." },
      })
      .catch(() => undefined);
  }
}
