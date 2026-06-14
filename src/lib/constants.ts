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

// Stavy žádanky, které představují potvrzený budoucí výdaj (forecast):
// vybraná nabídka, objednáno nebo schváleno.
export const REQUEST_FORECAST_STATUSES = ["vyhovuje", "objednano", "schvaleno"];

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
export const EXPENSE_STATUSES = [
  { value: "k_objednani", label: "K objednání" },
  { value: "objednano", label: "Objednáno" },
  { value: "k_uhrade", label: "K úhradě" },
  { value: "uhrazeno", label: "Uhrazeno" },
] as const;

export function expenseStatusLabel(value: string) {
  return EXPENSE_STATUSES.find((s) => s.value === value)?.label ?? value;
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
