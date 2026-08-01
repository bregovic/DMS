// Vestavěné typy projektů (vždy dostupné). Vlastní typy se přidávají do DB
// tabulky ProjectType – viz src/server/project-types.ts
export const BUILTIN_PROJECT_TYPES = [
  { key: "realEstate", label: "Nemovitosti" },
  { key: "vehicles", label: "Vozidla" },
  { key: "electronics", label: "Elektronika" },
  { key: "household", label: "Domácnost" },
  { key: "garden", label: "Zahrada" },
  { key: "business", label: "Firma / Podnikání" },
  { key: "leisure", label: "Volný čas / Hobby" },
  { key: "other", label: "Ostatní" },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: "materials", label: "Materiál" },
  { value: "prace", label: "Práce" },
  { value: "services", label: "Služby / práce" },
  { value: "energy", label: "Energie" },
  { value: "insurance", label: "Pojištění" },
  { value: "tax", label: "Daně / poplatky" },
  { value: "maintenance", label: "Údržba / opravy" },
  { value: "fuel", label: "Palivo" },
  { value: "other", label: "Ostatní" },
] as const;

export function categoryLabel(value: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? "Ostatní";
}

export const INCOME_CATEGORIES = [
  { value: "dotace", label: "Dotace / grant" },
  { value: "vklad", label: "Vlastní vklad" },
  { value: "uver", label: "Úvěr / půjčka" },
  { value: "prodej", label: "Prodej" },
  { value: "najem", label: "Nájem / pronájem" },
  { value: "refundace", label: "Refundace / vratka" },
  { value: "other", label: "Ostatní" },
] as const;

export function incomeCategoryLabel(value: string) {
  return INCOME_CATEGORIES.find((c) => c.value === value)?.label ?? "Ostatní";
}

export const VENDOR_CATEGORIES = [
  { value: "construction", label: "Stavební práce" },
  { value: "plumbing", label: "Instalatér / Topenář" },
  { value: "electrical", label: "Elektrikář" },
  { value: "wholesale", label: "Velkoobchod" },
  { value: "service", label: "Servis" },
  { value: "cleaning", label: "Úklid" },
  { value: "garden", label: "Zahrada" },
  { value: "transport", label: "Doprava" },
  { value: "it", label: "IT / Elektronika" },
  { value: "other", label: "Ostatní" },
] as const;

export function vendorCategoryLabel(value: string) {
  return VENDOR_CATEGORIES.find((c) => c.value === value)?.label ?? "Ostatní";
}

// Role přístupu k projektu. "vendor" = jen kontakt (bez přihlášení/přístupu).
export const PROJECT_ROLES = [
  { value: "vendor", label: "Dodavatel" },
  { value: "active", label: "Aktivní dodavatel" },
  { value: "member", label: "Spolusprávce" },
  { value: "reader", label: "Reader" },
  { value: "owner", label: "Owner" },
] as const;

export function roleLabel(value: string) {
  return PROJECT_ROLES.find((r) => r.value === value)?.label ?? value;
}

export const EXPENSE_KINDS = [
  { value: "expense", label: "Výdaj" },
  { value: "work", label: "Práce" },
] as const;

export function kindLabel(value: string) {
  return EXPENSE_KINDS.find((k) => k.value === value)?.label ?? "Výdaj";
}

export function statusLabel(value: string) {
  return value === "for_approval" ? "Ke schválení" : "Schváleno";
}

export const REQUEST_UNITS = [
  { value: "ks", label: "ks" },
  { value: "bal", label: "bal" },
  { value: "pal", label: "pal" },
  { value: "sada", label: "sada" },
  { value: "kg", label: "kg" },
  { value: "t", label: "t" },
  { value: "m", label: "m" },
  { value: "m2", label: "m²" },
  { value: "m3", label: "m³" },
  { value: "l", label: "l" },
  { value: "hod", label: "hod" },
] as const;

export function unitLabel(value: string) {
  return REQUEST_UNITS.find((u) => u.value === value)?.label ?? value;
}

export const REQUEST_STATUSES = [
  { value: "poptavka", label: "Poptávka" },
  { value: "nabidka", label: "Nabídka" },
  { value: "vyhovuje", label: "Vyhovuje" },
  { value: "objednano", label: "Objednáno" },
  { value: "schvaleno", label: "Schváleno" },
  { value: "zruseno", label: "Zrušeno" },
] as const;

// Stavy žádanky považované za "vyřízené" (objednáno/uzavřeno) – kvůli procurement prerekvizitě.
export const REQUEST_HANDLED_STATUSES = ["objednano", "schvaleno", "zruseno"];

// Stavy žádanky, které se počítají do forecastu budoucích výdajů – vše s cenou
// kromě zrušených (tj. i poptávky, např. vygenerované z katalogu).
export const REQUEST_FORECAST_STATUSES = [
  "poptavka",
  "nabidka",
  "vyhovuje",
  "objednano",
  "schvaleno",
];

export function requestStatusLabel(value: string) {
  return REQUEST_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export const OFFER_STATUSES = [
  { value: "nova", label: "Nová" },
  { value: "vyhovuje", label: "Vyhovuje" },
  { value: "odmitnuta", label: "Odmítnuta" },
  { value: "vybrana", label: "Vybraná" },
] as const;

export function offerStatusLabel(value: string) {
  return OFFER_STATUSES.find((s) => s.value === value)?.label ?? value;
}

// Životní cyklus výdaje (vestavěné). Vlastní stavy se přidávají do číselníku
// StatusOption scope "expense". Úhrada a schvalování jsou samostatné.
export const EXPENSE_NEW_STAGE = "novy";
export const EXPENSE_EXPORTED_STAGE = "exportovano";

/* Životní cyklus výdaje: vznikne → odejde do účetnictví → jde k proplacení →
   je zaplacený. Dřívější „K objednání" a „Objednáno" nepoužíval žádný záznam,
   objednávky řeší žádanky, tak jsou pryč. */
export const EXPENSE_STATUSES = [
  { value: EXPENSE_NEW_STAGE, label: "Nový" },
  { value: EXPENSE_EXPORTED_STAGE, label: "Exportováno" },
  { value: "k_uhrade", label: "K úhradě" },
  { value: "uhrazeno", label: "Uhrazeno" },
] as const;

/** Pořadí ve fázi – aby export nemohl vrátit už uhrazený výdaj zpátky. */
export function expenseStageRank(stage: string | null | undefined): number {
  const i = EXPENSE_STATUSES.findIndex((s) => s.value === expenseStage(stage));
  return i < 0 ? 0 : i;
}

/** Výdaje založené dřív stav nemají – bereme je jako „Nový", ať nevypadnou
 *  z filtrů a přehledů. Šetří to migraci nad stovkou existujících záznamů. */
export function expenseStage(stage: string | null | undefined): string {
  return stage || EXPENSE_NEW_STAGE;
}

export function expenseStatusLabel(value: string | null | undefined) {
  const v = expenseStage(value);
  return EXPENSE_STATUSES.find((s) => s.value === v)?.label ?? v;
}

// Úhrada výdaje se řídí stavem (ne samostatným booleanem). "uhrazeno" = zaplaceno.
export const EXPENSE_PAID_STAGE = "uhrazeno";
export const EXPENSE_TOPAY_STAGE = "k_uhrade";
export function isExpensePaid(stage: string | null | undefined) {
  return stage === EXPENSE_PAID_STAGE;
}

// Stavy úkolů (vestavěné). Vlastní v číselníku StatusOption scope "task".
export const TASK_STATUSES = [
  { value: "rozhodnout", label: "Rozhodnout" },
  { value: "todo", label: "K udělání" },
  { value: "in_progress", label: "Probíhá" },
  { value: "done", label: "Hotovo" },
  { value: "cancelled", label: "Zrušeno" },
] as const;

// Stavy považované za "uzavřené" (kvůli barvě v Ganttu).
export const TASK_DONE_STATUSES = ["done", "cancelled"];

export function taskStatusLabel(value: string) {
  return TASK_STATUSES.find((s) => s.value === value)?.label ?? value;
}

// Priorita úkolů (volitelná).
export const PRIORITIES = [
  { value: "high", label: "Vysoká", color: "rose" },
  { value: "medium", label: "Střední", color: "amber" },
  { value: "low", label: "Nízká", color: "stone" },
] as const;

export function priorityLabel(value?: string | null) {
  return PRIORITIES.find((p) => p.value === value)?.label ?? null;
}
export function priorityColor(value?: string | null) {
  return PRIORITIES.find((p) => p.value === value)?.color ?? "stone";
}

export const DOCUMENT_TYPES = [
  { value: "receipt", label: "Účtenka" },
  { value: "invoice", label: "Faktura" },
  { value: "contract", label: "Smlouva" },
  { value: "revision", label: "Revize" },
  { value: "insurance", label: "Pojistka" },
  { value: "other", label: "Ostatní" },
] as const;

export function docTypeLabel(value: string) {
  return DOCUMENT_TYPES.find((d) => d.value === value)?.label ?? "Ostatní";
}
