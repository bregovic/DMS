/**
 * Registr plátců DPH (MF ČR): zveřejněné bankovní účty a spolehlivost plátce.
 * Používá se v nastavení – účet na faktuře má být ten zveřejněný, jinak
 * odběratel ručí za daň.
 */
export type VatAccount = { display: string; published: string | null; standard: boolean };
export type VatRegistryResult = {
  found: boolean;
  unreliable: boolean | null; // true = nespolehlivý plátce
  accounts: VatAccount[];
};

const ENDPOINT = "https://adisrws.mfcr.cz/adistc/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP";

export async function vatRegistry(dicRaw: string): Promise<VatRegistryResult> {
  const dic = dicRaw.replace(/\s/g, "").toUpperCase().replace(/^CZ/, "");
  if (!/^\d{8,10}$/.test(dic)) throw new Error("DIČ musí být ve tvaru CZ a 8–10 číslic.");
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:roz="http://adis.mfcr.cz/rozhraniCRPDPH/">
  <soapenv:Body><roz:StatusNespolehlivyPlatceRequest><roz:dic>${dic}</roz:dic></roz:StatusNespolehlivyPlatceRequest></soapenv:Body>
</soapenv:Envelope>`;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "text/xml;charset=UTF-8", soapaction: "getStatusNespolehlivyPlatce" },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("Registr plátců DPH je nedostupný.");
  const xml = await res.text();

  const status = /nespolehlivyPlatce="([^"]+)"/.exec(xml)?.[1] ?? "NENALEZEN";
  const accounts: VatAccount[] = [];
  const re = /<ucet datumZverejneni="([^"]*)"><(standardniUcet|nestandardniUcet)([^/]*)\/><\/ucet>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const [, published, kind, attrs] = m;
    const cislo = /cislo="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const predcisli = /predcisli="([^"]*)"/.exec(attrs)?.[1];
    const kodBanky = /kodBanky="([^"]*)"/.exec(attrs)?.[1];
    const standard = kind === "standardniUcet";
    accounts.push({
      display: standard ? `${predcisli ? `${predcisli}-` : ""}${cislo}/${kodBanky}` : cislo,
      published: published || null,
      standard,
    });
  }
  return { found: status !== "NENALEZEN", unreliable: status === "NENALEZEN" ? null : status === "ANO", accounts };
}
