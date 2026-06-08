export const PROJECT_TYPES = [
  { value: "house", label: "Dům" },
  { value: "apartment", label: "Byt" },
  { value: "car", label: "Auto" },
  { value: "garage", label: "Garáž" },
  { value: "garden", label: "Zahrada" },
  { value: "other", label: "Jiné" },
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

export function projectTypeLabel(value: string) {
  return PROJECT_TYPES.find((t) => t.value === value)?.label ?? "Jiné";
}

export function categoryLabel(value: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? "Ostatní";
}
