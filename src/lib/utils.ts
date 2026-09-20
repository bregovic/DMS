import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Kód měny musí být tři písmena (ISO 4217); „Kč“ a podobné mapujeme na CZK. */
export function currencyCode(currency: string | null | undefined) {
  const c = (currency ?? "").trim().toUpperCase();
  if (/^K[ČC]$/.test(c) || c === "KCS") return "CZK";
  if (c === "€") return "EUR";
  if (c === "$") return "USD";
  return /^[A-Z]{3}$/.test(c) ? c : "CZK";
}

export function formatCurrency(amount: number, currency = "CZK") {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: currencyCode(currency),
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}
