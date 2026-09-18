/**
 * Hlavička e-mailu (.eml) – odesílatel, předmět, datum.
 *
 * K žádance se přikládají e-maily s nabídkami (#32). Aby v seznamu nebylo
 * jen "nabidka.eml", vytáhne se z hlavičky kdo a o čem psal. Tělo se
 * nečte – hlavička je vždycky na začátku souboru a stačí.
 *
 * .msg (Outlook) je binární formát – ten se jen uloží, bez shrnutí.
 */

export type EmlHeader = { from: string | null; subject: string | null; date: Date | null };

/** =?charset?B|Q?text?= → text. Neznámou znakovou sadu nechá být. */
function decodeWords(value: string): string {
  // Mezery mezi dvěma kódovanými slovy se podle RFC 2047 zahazují.
  const joined = value.replace(/\?=\s+=\?/g, "?==?");
  return joined.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (whole, charset, enc, text) => {
    try {
      const bytes =
        enc.toUpperCase() === "B"
          ? Buffer.from(text, "base64")
          : Buffer.from(
              text
                .replace(/_/g, " ")
                .replace(/=([0-9A-Fa-f]{2})/g, (_: string, h: string) =>
                  String.fromCharCode(parseInt(h, 16)),
                ),
              "latin1",
            );
      return new TextDecoder(charset.toLowerCase()).decode(bytes);
    } catch {
      return whole;
    }
  });
}

export function parseEmlHeader(buffer: Buffer): EmlHeader {
  // Hlavička končí prázdným řádkem; víc než 64 kB nemá smysl číst.
  const head = buffer.subarray(0, 64 * 1024).toString("latin1");
  const end = head.search(/\r?\n\r?\n/);
  const block = end >= 0 ? head.slice(0, end) : head;
  // Pokračovací řádky (začínají mezerou/tabem) patří k předchozí hlavičce.
  const lines = block.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/);

  const get = (name: string) => {
    const line = lines.find((l) => l.toLowerCase().startsWith(`${name}:`));
    if (!line) return null;
    // Nekódovaná hlavička s diakritikou bývá v UTF-8 - latin1 čtení vrátit.
    const raw = Buffer.from(line.slice(name.length + 1).trim(), "latin1").toString("utf8");
    return decodeWords(raw).trim() || null;
  };

  const dateRaw = get("date");
  const date = dateRaw ? new Date(dateRaw) : null;
  return {
    from: get("from"),
    subject: get("subject"),
    date: date && !isNaN(date.getTime()) ? date : null,
  };
}

/** Krátké shrnutí do seznamu příloh: "Jan Novák · Nabídka elektro". */
export function emlSummary(h: EmlHeader): string | null {
  const who = h.from?.replace(/\s*<[^>]+>\s*$/, "").replace(/^"|"$/g, "").trim() || h.from;
  const parts = [who, h.subject].filter(Boolean);
  return parts.length ? parts.join(" · ").slice(0, 300) : null;
}
