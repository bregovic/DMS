// Formát výměnného souboru "projektový plán" (export ↔ import).
// Verze 1. ID = identita v DB (pro aktualizaci), REF = lokální token pro
// provázání řádků (žádanka↔nabídka, fáze↔úkol, výdaj↔žádanka/nabídka).
// Nové řádky (např. doplněné v Claude) nechají ID prázdné a použijí vlastní REF.

export const PLAN_VERSION = 1;

export type PlanVendor = {
  ico?: string | null;
  nazev?: string | null;
  dic?: string | null;
  email?: string | null;
  adresa?: string | null;
};

export type PlanSubProject = {
  id?: string | null;
  ref?: string | null;
  nazev: string;
  rodicRef?: string | null;
  popis?: string | null;
};

export type PlanOffer = {
  id?: string | null;
  ref?: string | null;
  dodavatelIco?: string | null;
  dodavatelNazev?: string | null;
  dodavatelEmail?: string | null;
  cena?: number | null;
  terminDodani?: string | null; // yyyy-mm-dd
  body?: number | null; // 0–100
  hodnoceni?: string | null; // hodnocení dodavatele (text)
  komentar?: string | null;
  stav?: string | null;
  vybrana?: boolean;
};

export type PlanRequest = {
  id?: string | null;
  ref?: string | null;
  nazev: string;
  popis?: string | null;
  termin?: string | null; // yyyy-mm-dd – do plánování
  stav?: string | null; // poptavka | nabidka | vyhovuje | schvaleno | zruseno
  slozkaRef?: string | null;
  mnozstvi?: number | null;
  jednotka?: string | null;
  kategorie?: string | null;
  nabidky?: PlanOffer[];
};

export type PlanTask = {
  id?: string | null;
  ref?: string | null;
  nazev: string;
  komu?: string | null; // e-mail řešitele
  start?: string | null;
  termin?: string | null;
  stav?: string | null; // todo | in_progress | done | cancelled
  slozkaRef?: string | null;
};

export type PlanPhase = PlanTask & { ukoly?: PlanTask[] };

export type PlanExpense = {
  id?: string | null;
  nazev: string;
  castka: number;
  mena?: string | null;
  kategorie?: string | null; // label kategorie
  datum?: string | null;
  dodavatelIco?: string | null;
  dodavatelEmail?: string | null;
  slozkaRef?: string | null;
  zadankaRef?: string | null; // realizace žádanky
  nabidkaRef?: string | null; // realizace konkrétní nabídky
};

export type ProjectPlan = {
  dmsPlan: number; // verze formátu
  exportedAt?: string;
  projekt: { id?: string | null; nazev: string; typ?: string | null };
  dodavatele?: PlanVendor[];
  slozky?: PlanSubProject[];
  zadanky?: PlanRequest[];
  faze?: PlanPhase[];
  ukoly?: PlanTask[]; // úkoly bez fáze
  vydaje?: PlanExpense[];
};

// yyyy-mm-dd z Date (lokální), nebo null.
export function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const x = new Date(d);
  if (isNaN(x.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

// Přijme yyyy-mm-dd i dd.mm.yyyy i ISO; vrátí Date nebo null.
export function parseAnyDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}
