/** Převede český účet "predcisli-cislo/banka" na IBAN. Vrátí null při nezdaru. */
export function czAccountToIban(input: string): string | null {
  const acc = input.replace(/\s/g, "");
  const m = acc.match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/);
  if (!m) return null;
  const prefix = (m[1] ?? "").padStart(6, "0");
  const number = m[2].padStart(10, "0");
  const bank = m[3];
  const bban = bank + prefix + number; // 4 + 6 + 10 = 20
  const rearranged = bban + "123500"; // "CZ" -> 12,35 + "00"
  let mod = 0;
  for (const ch of rearranged) mod = (mod * 10 + Number(ch)) % 97;
  const check = (98 - mod).toString().padStart(2, "0");
  return `CZ${check}${bban}`;
}

/** Z uloženého účtu vrátí IBAN (přijme přímo IBAN i český formát). */
export function resolveIban(account: string | null | undefined): string | null {
  if (!account) return null;
  const a = account.replace(/\s/g, "");
  if (/^[A-Z]{2}\d{2}[A-Z0-9]+$/i.test(a)) return a.toUpperCase(); // už IBAN
  return czAccountToIban(a);
}

// SPAYD (QR platba) očekává v podstatě ASCII. Odstraníme diakritiku a převedeme
// běžnou typografii (pomlčky, uvozovky) na ASCII; cokoli mimo tisknutelné ASCII
// zahodíme, ať bankovní aplikace zprávu (MSG) vždy načte.
function ascii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[‒-―−]/g, "-") // pomlčky/minus → -
    .replace(/[‘’‚‛]/g, "'") // jednoduché uvozovky → '
    .replace(/[“”„‟]/g, '"') // dvojité uvozovky → "
    .replace(/[*\r\n\t]/g, " ") // oddělovač SPAYD + řídicí znaky
    .replace(/[^\x20-\x7E]/g, "") // zahodit zbylé ne-ASCII
    .replace(/\s+/g, " ")
    .trim();
}

/** Sestaví řetězec SPD (česká QR platba). */
export function buildSpd(o: {
  iban: string;
  amount?: number | null;
  currency?: string;
  vs?: string | null;
  msg?: string | null;
}): string {
  const parts = ["SPD*1.0", `ACC:${o.iban}`];
  if (o.amount != null && o.amount > 0) parts.push(`AM:${o.amount.toFixed(2)}`);
  parts.push(`CC:${o.currency || "CZK"}`);
  const vs = o.vs?.replace(/\D/g, "").slice(0, 10);
  if (vs) parts.push(`X-VS:${vs}`);
  if (o.msg) {
    const m = ascii(o.msg).slice(0, 60);
    if (m) parts.push(`MSG:${m}`);
  }
  return parts.join("*");
}
