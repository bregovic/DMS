import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * Dodavatelský portál (#49) – společné věci pro správu řízení i veřejné
 * stránky: odkazy, kódy, stavy a texty e-mailů.
 */

export const TENDER_STATUSES = [
  { value: "draft", label: "Koncept" },
  { value: "open", label: "Přijímá nabídky" },
  { value: "closed", label: "Uzavřeno" },
] as const;

export function tenderStatusLabel(v: string) {
  return TENDER_STATUSES.find((s) => s.value === v)?.label ?? v;
}

/** Strop jedné přílohy a celého podání. */
export const PORTAL_MAX_FILE = 15 * 1024 * 1024;
export const PORTAL_MAX_TOTAL = 40 * 1024 * 1024;
export const PORTAL_FILE_TYPES =
  /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif)|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/msword|application\/vnd\.ms-excel)$/i;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bez 0/O, 1/I

function randomCode(len: number) {
  const bytes = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

/** Odkaz řízení i pozvánky – nedá se uhodnout (~80 bitů). */
export function newToken() {
  return randomCode(16).toLowerCase();
}

/** Kód pro sledování nabídky, čitelný i do telefonu: ABCD-EFGH. */
export function newTrackingCode() {
  const c = randomCode(8);
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

export function appUrl() {
  return (process.env.APP_URL || "https://dokumenty.up.railway.app").replace(/\/$/, "");
}

export const portalLink = (token: string) => `${appUrl()}/p/${token}`;
export const trackingLink = (code: string) => `${appUrl()}/n/${code}`;

export type OfferField = { label: string; unit?: string | null; required?: boolean };

/** Údaje k vyplnění z JSONu žádanky (staré nebo poškozené hodnoty ignoruje). */
export function readOfferFields(v: unknown): OfferField[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      label: String(f.label ?? "").trim(),
      unit: f.unit ? String(f.unit).trim() : null,
      required: !!f.required,
    }))
    .filter((f) => f.label);
}

/**
 * Údaje jako text po řádcích: „Výrobce a systém *“, „Uw [W/m²K]“.
 * Hvězdička na konci = povinné, jednotka v hranatých závorkách.
 */
export function offerFieldsToText(fields: OfferField[]) {
  return fields.map((f) => `${f.label}${f.unit ? ` [${f.unit}]` : ""}${f.required ? " *" : ""}`).join("\n");
}

export function offerFieldsFromText(text: string): OfferField[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((l) => {
      let line = l;
      const required = /\*\s*$/.test(line);
      if (required) line = line.replace(/\*\s*$/, "").trim();
      let unit: string | null = null;
      const m = line.match(/\[([^\]]+)\]\s*$/);
      if (m) {
        unit = m[1].trim();
        line = line.slice(0, m.index).trim();
      }
      return { label: line.slice(0, 120), unit, required };
    })
    .filter((f) => f.label);
}

/**
 * Stav nabídky, jak ho vidí dodavatel. Výsledek (vybrána / nevybrána) až po
 * zveřejnění odpovědi – do té doby jen „přijata“ nebo „v posuzování“.
 */
export function publicOfferStatus(o: { status: string; selected: boolean }, published: boolean) {
  if (published) {
    if (o.selected || o.status === "vybrana") return { key: "won", label: "Vybrána" };
    return { key: "lost", label: "Nevybrána" };
  }
  if (o.status === "nova") return { key: "received", label: "Přijata" };
  return { key: "review", label: "V posuzování" };
}

/**
 * Řízení nebo osobní pozvánka podle tokenu z odkazu.
 */
export async function resolvePortalToken(token: string) {
  const t = token.toLowerCase();
  const tender = await prisma.tender.findUnique({ where: { token: t }, select: { id: true } });
  if (tender) return { tenderId: tender.id, inviteId: null as string | null };
  const invite = await prisma.tenderInvite.findUnique({ where: { token: t }, select: { id: true, tenderId: true } });
  if (invite) return { tenderId: invite.tenderId, inviteId: invite.id };
  return null;
}

export function tenderAcceptsOffers(t: { status: string; deadline: Date | null }) {
  if (t.status !== "open") return false;
  if (t.deadline) {
    // termín platí včetně celého dne
    const end = new Date(t.deadline);
    end.setUTCHours(23, 59, 59, 999);
    if (Date.now() > end.getTime()) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Texty e-mailů (posílají se ručně – tady se jen připraví předmět a text).
// ---------------------------------------------------------------------------

type Sender = { name: string | null; contact: string | null };

function podpis(s: Sender) {
  // Kontakt obvykle začíná jménem – nepsat ho dvakrát.
  const contact =
    s.name && s.contact?.startsWith(s.name) ? s.contact.slice(s.name.length).replace(/^[,\s]+/, "") : s.contact;
  return ["S pozdravem", s.name, contact].filter(Boolean).join("\n");
}

export function inviteEmail(
  t: { title: string; location: string | null; deadline: Date | null; requests: string[] },
  link: string,
  sender: Sender,
) {
  const kde = t.location ? ` (${t.location})` : "";
  const polozky =
    t.requests.length > 1 ? `\n\nPoptáváme tyto položky:\n${t.requests.map((r) => `– ${r}`).join("\n")}` : "";
  const termin = t.deadline ? `\n\nNabídku prosím pošlete do ${formatDate(t.deadline)}.` : "";
  return {
    subject: `Poptávka: ${t.title}`,
    body: `Dobrý den,

obracím se na Vás s poptávkou – ${t.title}${kde}.${polozky}

Pokud byste byli tak laskaví a připravili nám nabídku, prosím o její zadání přes tento formulář:
${link}

Ve formuláři najdete zadání jednotlivých položek, fotografie a údaje, které potřebujeme k porovnání nabídek. Nabídku lze podat i jen na některé položky a přiložit k ní vlastní dokument. Pokud by v zadání bylo něco nejasného nebo by bylo potřeba něco doplnit, odpovězte mi prosím na tento e-mail.${termin}

Předem děkuji za Váš čas.

${podpis(sender)}`,
  };
}

/**
 * Odpověď dodavateli po rozhodnutí: poděkování, výsledek po položkách.
 */
export function replyText(
  offers: { title: string; won: boolean }[],
  sender: Sender,
) {
  const won = offers.filter((o) => o.won);
  const lost = offers.filter((o) => !o.won);
  let jadro: string;
  if (won.length && !lost.length) {
    jadro =
      "děkujeme za Vaši nabídku. Rádi bychom ji přijali a v nejbližších dnech se Vám ozveme ohledně objednávky a termínu.";
  } else if (won.length) {
    jadro = `děkujeme za Vaši nabídku. U položek ${won.map((o) => o.title).join(", ")} bychom ji rádi přijali a ozveme se Vám ohledně objednávky a termínu. U položek ${lost.map((o) => o.title).join(", ")} jsme se tentokrát rozhodli pro jinou nabídku.`;
  } else {
    jadro =
      "děkujeme za Vaši nabídku a za čas, který jste jí věnovali. Po porovnání všech nabídek jsme se tentokrát rozhodli pro jinou nabídku.\n\nRádi se na Vás obrátíme při dalších poptávkách.";
  }
  return `Dobrý den,\n\n${jadro}\n\n${podpis(sender)}`;
}

export function replyEmail(tenderTitle: string, text: string, link: string) {
  return {
    subject: `Re: Poptávka: ${tenderTitle}`,
    body: `${text}\n\nStav nabídky: ${link}`,
  };
}

/** Krátký přehled ceny nabídky pro výpisy. */
export function offerPriceLine(o: { price: unknown; priceWithoutVat: unknown; vatRate: number | null }) {
  const s = o.price != null ? formatCurrency(Number(o.price)) : null;
  const b = o.priceWithoutVat != null ? formatCurrency(Number(o.priceWithoutVat)) : null;
  if (s && b) return `${b} bez DPH · ${s} s DPH${o.vatRate != null ? ` (${o.vatRate} %)` : ""}`;
  return s ?? b ?? "bez ceny";
}

/**
 * Statistika dodavatelů z řízení: osloven / odpověděl / vybrán.
 */
export async function vendorTenderStats(vendorIds: string[]) {
  const ids = [...new Set(vendorIds.filter(Boolean))];
  const out = new Map<string, { invited: number; answered: number; won: number }>();
  if (!ids.length) return out;
  const [invites, subs] = await Promise.all([
    prisma.tenderInvite.findMany({
      where: { vendorId: { in: ids } },
      select: { vendorId: true, tenderId: true, submissions: { select: { id: true }, take: 1 } },
    }),
    prisma.tenderSubmission.findMany({
      where: { vendorId: { in: ids } },
      select: { vendorId: true, tenderId: true, offers: { select: { selected: true, status: true } } },
    }),
  ]);
  for (const id of ids) {
    const inv = invites.filter((i) => i.vendorId === id);
    const sub = subs.filter((s) => s.vendorId === id);
    const tenders = new Set([...inv.map((i) => i.tenderId), ...sub.map((s) => s.tenderId)]);
    const answered = new Set(sub.map((s) => s.tenderId));
    const won = new Set(
      sub.filter((s) => s.offers.some((o) => o.selected || o.status === "vybrana")).map((s) => s.tenderId),
    );
    out.set(id, { invited: tenders.size, answered: answered.size, won: won.size });
  }
  return out;
}
