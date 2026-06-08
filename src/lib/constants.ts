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
