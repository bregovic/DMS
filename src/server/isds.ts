/**
 * Odeslání podání do datové schránky (ISDS).
 *
 * Přiznání k DPH i kontrolní hlášení jde podat datovou zprávou: XML ve formátu
 * předepsaném Pokynem D-349 (tedy přesně to, co umíme vyexportovat) se pošle
 * do datové schránky příslušného finančního úřadu. Nic se nepodepisuje –
 * podáním je samotná datová zpráva.
 *
 * Přihlašovací údaje ke schránce se berou z proměnných prostředí, nikdy
 * z databáze: ISDS_LOGIN, ISDS_PASSWORD a volitelně ISDS_BASE
 * (https://ws1.czebox.cz = veřejný test, jinak ostrý provoz).
 *
 * Rozhraní: SOAP 1.1, operace CreateMessage, endpoint <base>/DS/dz,
 * jmenný prostor http://isds.czechpoint.cz/v20.
 */

const NS = "http://isds.czechpoint.cz/v20";
const DEFAULT_BASE = "https://ws1.datovka.gov.cz";

export type IsdsResult = { messageId: string } | { error: string };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function isdsConfigured(): boolean {
  return !!process.env.ISDS_LOGIN && !!process.env.ISDS_PASSWORD;
}

/** Je nastavený veřejný test (czebox), nebo ostrý provoz? */
export function isdsMode(): "test" | "ostrý" {
  return (process.env.ISDS_BASE ?? DEFAULT_BASE).includes("czebox") ? "test" : "ostrý";
}

/**
 * Odešle jednu datovou zprávu s XML přílohou.
 * `annotation` je předmět zprávy (na portálu popis), max. 255 znaků.
 */
export async function sendDataMessage(opts: {
  recipient: string; // ID datové schránky příjemce (7 znaků)
  annotation: string;
  fileName: string;
  xml: string;
}): Promise<IsdsResult> {
  const login = process.env.ISDS_LOGIN;
  const password = process.env.ISDS_PASSWORD;
  if (!login || !password) return { error: "Datová schránka není nastavená (chybí ISDS_LOGIN a ISDS_PASSWORD)." };
  const recipient = opts.recipient.trim();
  if (recipient.length !== 7) return { error: "ID datové schránky finančního úřadu musí mít 7 znaků." };

  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:p="${NS}">
  <soap:Body>
    <p:CreateMessage>
      <p:dmEnvelope>
        <p:dbIDRecipient>${esc(recipient)}</p:dbIDRecipient>
        <p:dmAnnotation>${esc(opts.annotation.slice(0, 255))}</p:dmAnnotation>
        <p:dmAllowSubstDelivery>true</p:dmAllowSubstDelivery>
      </p:dmEnvelope>
      <p:dmFiles>
        <p:dmFile dmMimeType="application/xml" dmFileMetaType="main" dmFileDescr="${esc(opts.fileName)}">
          <p:dmEncodedContent>${Buffer.from(opts.xml, "utf8").toString("base64")}</p:dmEncodedContent>
        </p:dmFile>
      </p:dmFiles>
    </p:CreateMessage>
  </soap:Body>
</soap:Envelope>`;

  const url = `${process.env.ISDS_BASE ?? DEFAULT_BASE}/DS/dz`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "text/xml; charset=utf-8",
        soapaction: `"${NS}/CreateMessage"`,
        authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    return { error: `Datovou schránku se nepodařilo kontaktovat: ${e instanceof Error ? e.message : "chyba sítě"}` };
  }

  const text = await res.text();
  if (res.status === 401) return { error: "Datová schránka odmítla přihlášení – zkontroluj ISDS_LOGIN a ISDS_PASSWORD." };
  const code = /<[^>]*dmStatusCode[^>]*>([^<]*)</.exec(text)?.[1]?.trim();
  const message = /<[^>]*dmStatusMessage[^>]*>([^<]*)</.exec(text)?.[1]?.trim();
  const id = /<[^>]*dmID[^>]*>([^<]*)</.exec(text)?.[1]?.trim();
  if (!res.ok && !code) return { error: `Datová schránka vrátila chybu ${res.status}.`.trim() };
  // 0000 = v pořádku; cokoli jiného je chyba ISDS i při HTTP 200
  if (code && code !== "0000") return { error: `Datová schránka: ${message ?? "chyba"} (${code})` };
  if (!id) return { error: "Zpráva se neodeslala – ISDS nevrátila číslo zprávy." };
  return { messageId: id };
}
