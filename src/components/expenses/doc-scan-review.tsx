"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, Loader2 } from "lucide-react";
import {
  applyDocScan,
  applyOfferScan,
  dismissDocScan,
  getDocScan,
  mistaProZarazeni,
  restartScan,
  scanDocument,
  vendorsForScan,
  zadankyProVyber,
} from "@/server/actions/doc-scan";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, FormSection } from "@/components/ui/form-section";
import { DocPreview } from "@/components/documents/doc-preview";
import { formatCurrency } from "@/lib/utils";
import { claimedTotals } from "@/lib/vat";
import type { ScanResult } from "@/server/doc-scan";

const input =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none";

type Vendor = { id: string; name: string; ico: string | null; dic: string | null; bankAccount: string | null };

/**
 * Kontrola vytěženého dokladu: co systém přečetl, uživatel opraví a potvrdí –
 * teprve tím vznikne výdaj s daňovými údaji a položkami.
 */
export function DocScanReview({
  scanId,
  documentId,
  projectId,
  subProjectId: vychoziSub = null,
  subProjects = [],
  categories,
  label = "Zkontrolovat doklad",
  autoOpen = false,
  hideButton = false,
  onDone,
}: {
  scanId: string | null;
  documentId: string | null;
  projectId: string | null;
  /** Otevřená složka projektu – předvyplní zařazení dokladu. */
  subProjectId?: string | null;
  subProjects?: { id: string; name: string }[];
  categories: { key: string; label: string }[];
  label?: string;
  autoOpen?: boolean;
  /** Dialog řídí někdo jiný (fronta kontroly) – vlastní tlačítko se nekreslí. */
  hideButton?: boolean;
  /** "done" = doklad vyřízený (založený nebo zahozený), "close" = uživatel odešel. */
  onDone?: (vysledek: "done" | "close") => void;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scan, setScan] = useState<Awaited<ReturnType<typeof getDocScan>> | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ScanResult["items"]>([]);
  const [rows, setRows] = useState<ScanResult["vatBreakdown"]>([]);
  const [novaKat, setNovaKat] = useState<string | null>(null);
  const [mista, setMista] = useState<{ value: string; label: string }[]>([]);
  const [zadanky, setZadanky] = useState<{ id: string; title: string; projectId: string; place: string }[]>([]);
  const [vybrane, setVybrane] = useState<string[]>([]);
  /** Ruční přepnutí druhu (null = jak to přečetlo vytěžení). */
  const [jakoNabidka, setJakoNabidka] = useState<boolean | null>(null);
  const [novaZadanka, setNovaZadanka] = useState(false);
  const [nazevZadanky, setNazevZadanky] = useState("");
  const router = useRouter();

  // Dřív se vracel volný text („palivo"), dnes klíč („fuel"). U starších skenů
  // se proto hledá i podle popisku, ať výběr nezůstane prázdný.
  const katKlic = (v: string | null | undefined) => {
    const raw = (v ?? "").trim();
    if (!raw) return null;
    const bez = (x: string) => x.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    return categories.find((c) => c.key === raw)?.key ?? categories.find((c) => bez(c.label) === bez(raw))?.key ?? null;
  };

  const issuedDoc = form.direction === "issued";
  // Co z dokladu půjde do přiznání – přepočítává se při každém odškrtnutí,
  // ať uživatel vidí výsledek dřív, než doklad založí.
  const claim = claimedTotals(rows, items);
  const kraceno = !issuedDoc && items.some((i) => i.deductible === false) && rows.length > 0;
  const setItem = (idx: number, patch: Partial<ScanResult["items"][number]>) =>
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  async function load(id: string) {
    const s = await getDocScan(id);
    setScan(s);
    const r = s.result;
    if (r) {
      const issued = s.direction === "issued";
      setItems(r.items ?? []);
      setRows(r.vatBreakdown ?? []);
      setNovaKat(r.newCategory ?? null);
      setVybrane(r.requestIds ?? []);
      setJakoNabidka(null);
      setNovaZadanka(false);
      setNazevZadanky("");
      const match = vendors.find((v) => (r.supplier.ico && v.ico === r.supplier.ico) || v.name === r.supplier.name);
      // Nabídka datum často nemá – bere se dnešní, ať se nemusí dopisovat.
      const dnes = new Date().toISOString().slice(0, 10);
      const nabidka = r.docKind === "nabidka";
      /* Když doklad datum vystavení neuvádí (účtenka z termopapíru, fotka
         bez hlavičky), nabídne se datum nahrání – to je nejblíž skutečnosti
         a nenechá pole prázdné. */
      const nahranoRaw = s.document?.createdAt ?? s.inboundAttachment?.mail.receivedAt ?? s.createdAt;
      const nahrano = nahranoRaw ? new Date(nahranoRaw).toISOString().slice(0, 10) : "";
      setForm({
        title: r.title ?? r.supplier.name ?? "Doklad",
        description: r.summary ?? "",
        direction: issued ? "issued" : "received",
        supplierName: r.supplier.name ?? "",
        supplierIco: r.supplier.ico ?? "",
        supplierDic: r.supplier.dic ?? "",
        supplierBankAccount: r.supplier.bankAccount ?? "",
        customerName: r.customer?.name ?? "",
        customerIco: r.customer?.ico ?? "",
        customerDic: r.customer?.dic ?? "",
        vendorId: match?.id ?? "",
        createVendor: match ? "0" : "1",
        docNumber: r.number ?? "",
        date: r.issueDate ?? (nabidka ? dnes : nahrano),
        taxDate: r.taxDate ?? r.issueDate ?? "",
        dueDate: r.dueDate ?? "",
        variableSymbol: r.variableSymbol ?? "",
        currency: r.currency || "CZK",
        exchangeRate: String(r.exchangeRate ?? ""),
        total: String(r.total ?? ""),
        vatBase: String(r.totalBase ?? ""),
        vatAmount: String(r.totalVat ?? ""),
        category: issued ? "prodej" : katKlic(r.category) ?? (r.newCategory ? `__new__:${r.newCategory}` : "other"),
        subProjectId: r.subProjectId ?? vychoziSub ?? "",
        zarazeni: r.projectId ? `${r.projectId}:${r.subProjectId ?? vychoziSub ?? ""}` : "",
        deductible: "1",
        paid: r.docType === "receipt" ? "1" : "0",
      });
    }
  }

  useEffect(() => {
    if (!open) return;
    (async () => {
      setErr(null);
      try {
        const vs = await vendorsForScan(projectId);
        setVendors(vs);
        if (!projectId) setMista(await mistaProZarazeni());
        setZadanky(await zadankyProVyber());
        let id = scanId;
        if (!id) {
          if (!documentId) throw new Error("Doklad se nepodařilo načíst.");
          const fd = new FormData();
          fd.set("documentId", documentId);
          id = (await scanDocument(fd)).id;
        }
        await load(id);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Doklad se nepodařilo načíst.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // běžící vytěžení – doptat se
  useEffect(() => {
    if (!open || scan?.status !== "running") return;
    const t = setInterval(() => scan && load(scan.id).catch(() => {}), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scan?.status]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  // doklad v cizí měně: do DPH se počítá přepočet kurzem (z dokladu nebo ČNB)
  const foreign = (form.currency || "CZK").toUpperCase() !== "CZK";
  const rate = Number(String(form.exchangeRate ?? "").replace(",", ".")) || 0;
  const [force, setForce] = useState(false);
  const rowsTotal = rows.reduce((a, r) => a + r.base + r.vat, 0);

  async function apply() {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("scanId", scan!.id);
      for (const [k, v] of Object.entries(form)) fd.set(k, v);
      fd.set("vatRows", JSON.stringify(rows));
      // Vytěžení to přečetlo jako nabídku, uživatel to přepnul na doklad.
      if (scan?.result?.docKind === "nabidka") fd.set("jakoDoklad", "1");
      if (force) fd.set("force", "1");
      fd.set("items", JSON.stringify(items));
      if (!projectId) {
        const [p, sub] = String(form.zarazeni || "").split(":");
        if (!p) throw new Error("Vyber projekt.");
        fd.set("targetProjectId", p);
        fd.set("subProjectId", sub || "");
      }
      await applyDocScan(fd);
      setOpen(false);
      router.refresh();
      onDone?.("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Výdaj se nepodařilo založit.");
    }
    setBusy(false);
  }

  const jeNabidka = jakoNabidka ?? scan?.result?.docKind === "nabidka";

  async function applyOffer() {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("scanId", scan!.id);
      fd.set("requestIds", JSON.stringify(vybrane));
      fd.set("requestTitle", nazevZadanky.trim() || form.title || "");
      for (const k of ["supplierName", "supplierIco", "supplierDic", "vendorId", "total", "vatBase", "description", "zarazeni"])
        fd.set(k, form[k] ?? "");
      await applyOfferScan(fd);
      setOpen(false);
      router.refresh();
      onDone?.("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nabídku se nepodařilo založit.");
    }
    setBusy(false);
  }

  if (!open)
    return hideButton ? null : (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileSearch className="size-4" /> {label}
      </Button>
    );

  // Stránka z minulého nasazení volá serverové akce, které už neexistují.
  // Bez téhle hlášky se dialog jen věčně točil na „Čtu doklad…".
  const stara = !!err && /Server Action|Failed to find/i.test(err);
  const running = !err && (!scan || scan.status === "running");
  return (
    <Dialog
      title="Doklad – kontrola vytěžených údajů"
      size="3xl"
      onClose={() => {
        setOpen(false);
        onDone?.("close");
      }}
    >
      {running ? (
        <div className="flex items-center gap-2 p-6 text-sm text-stone-600">
          <Loader2 className="size-4 animate-spin" /> Čtu doklad… (do minuty)
        </div>
      ) : !scan ? (
        <div className="space-y-3 p-5">
          <p className="text-sm text-red-600">
            {stara ? "Aplikace se mezitím aktualizovala. Načti stránku znovu." : err}
          </p>
          <Button type="button" variant="outline" onClick={() => location.reload()}>
            Načíst znovu
          </Button>
        </div>
      ) : scan.status === "error" ? (
        <div className="space-y-3 p-5">
          <p className="text-sm text-red-600">{scan.error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                const fd = new FormData();
                fd.set("scanId", scan.id);
                await restartScan(fd);
                await load(scan.id);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Čtení se nepodařilo spustit.");
              }
            }}
          >
            Zkusit znovu
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-5 p-5">
            {scan.duplicate && (
              <div className="border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-medium">Tenhle doklad už v evidenci vypadá jako založený.</p>
                <p className="mt-0.5">
                  {scan.duplicate.kind === "income" ? "Příjem" : "Výdaj"} „{scan.duplicate.title}" ·{" "}
                  {new Date(scan.duplicate.date).toLocaleDateString("cs-CZ")} ·{" "}
                  {Math.round(scan.duplicate.amount).toLocaleString("cs-CZ")} Kč · {scan.duplicate.project}
                </p>
                <label className="mt-2 flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="size-4 accent-stone-900" />
                  Vím o tom, založit i tak
                </label>
              </div>
            )}
            {!!scan.result?.warnings?.length && (
              <ul className="border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                {scan.result.warnings.map((w, i) => (
                  <li key={i}>⚠ {w}</li>
                ))}
              </ul>
            )}

            {/* Vytěžení druh jen navrhuje – z nabídky se dá udělat rovnou doklad. */}
            <FormSection title="Co to je">
              <FormGrid>
                <Field label="Druh" htmlFor="ds-kind">
                  <select
                    id="ds-kind"
                    className={input}
                    value={jeNabidka ? "nabidka" : "doklad"}
                    onChange={(e) => setJakoNabidka(e.target.value === "nabidka")}
                  >
                    <option value="doklad">Doklad – účtenka nebo faktura</option>
                    <option value="nabidka">Nabídka</option>
                  </select>
                </Field>
                {scan.result?.docKind === "nabidka" && !jeNabidka && (
                  <p className="self-end text-xs text-stone-500">Přečteno jako nabídka.</p>
                )}
              </FormGrid>
            </FormSection>

            {!jeNabidka && (
            <FormSection title="Druh dokladu" hint="poznáme podle IČO a DIČ v Nastavení → Fakturace a daně">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    { v: "received", l: "Přijatý doklad", d: "nákup – výdaj a DPH na vstupu" },
                    { v: "issued", l: "Vystavený doklad", d: "moje faktura – příjem a DPH na výstupu" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => set("direction", o.v)}
                    className={`cursor-pointer border px-3 py-2 text-left transition-colors ${
                      (form.direction ?? "received") === o.v
                        ? "border-stone-950 bg-stone-950 text-white"
                        : "border-stone-300 text-stone-700 hover:border-stone-950"
                    }`}
                  >
                    <span className="block text-sm font-medium">{o.l}</span>
                    <span className={`block text-[11px] ${(form.direction ?? "received") === o.v ? "text-stone-300" : "text-stone-400"}`}>
                      {o.d}
                    </span>
                  </button>
                ))}
              </div>
            </FormSection>
            )}

            {!projectId && (!jeNabidka || novaZadanka) && (
              <FormSection
                title="Zařazení"
                hint={scan.result?.placeReason ?? undefined}
                actions={
                  scan.result?.docKind === "nabidka" ? (
                    <span className="text-xs text-stone-500">rozpoznáno jako nabídka</span>
                  ) : undefined
                }
              >
                <Combobox
                  name="zarazeni-pole"
                  items={mista.map((m) => ({ id: m.value, label: m.label }))}
                  defaultId={form.zarazeni || undefined}
                  placeholder="Hledat projekt nebo složku…"
                  allowEmpty={false}
                  onSelect={(item) => set("zarazeni", item?.id ?? "")}
                />
              </FormSection>
            )}

            {jeNabidka && (
              <FormSection title="Žádanky, které nabídka naceňuje" hint={scan.result?.placeReason ?? undefined}>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {zadanky.length === 0 && <p className="text-xs text-stone-500">Žádné otevřené žádanky.</p>}
                  {zadanky.map((z) => (
                    <label key={z.id} className="flex cursor-pointer items-start gap-2 py-0.5 text-sm">
                      <input
                        type="checkbox"
                        checked={vybrane.includes(z.id)}
                        onChange={(e) =>
                          setVybrane((v) => (e.target.checked ? [...v, z.id] : v.filter((x) => x !== z.id)))
                        }
                        className="mt-0.5 size-4 accent-stone-900"
                      />
                      <span className="min-w-0">
                        {z.title}
                        <span className="block text-xs text-stone-400">{z.place}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {vybrane.length > 1 && (
                  <p className="mt-2 border-t border-stone-200 pt-2 text-xs text-stone-600">
                    Nabídka pokrývá {vybrane.length} žádanky – sdruží se do balíčku a dokument bude u všech.
                  </p>
                )}
                {/* Nabídka na něco, co se zatím nepoptávalo – žádanka se založí z ní. */}
                {vybrane.length === 0 && (
                  <div className="mt-2 border-t border-stone-200 pt-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
                      <input
                        type="checkbox"
                        checked={novaZadanka}
                        onChange={(e) => setNovaZadanka(e.target.checked)}
                        className="size-4 accent-stone-900"
                      />
                      Založit žádanku z této nabídky
                    </label>
                    {novaZadanka && (
                      <input
                        className={`${input} mt-2`}
                        value={nazevZadanky}
                        onChange={(e) => setNazevZadanky(e.target.value)}
                        placeholder={form.title || form.supplierName || "Název žádanky"}
                      />
                    )}
                  </div>
                )}
              </FormSection>
            )}

            <FormSection
              title={jeNabidka ? "Nabídka" : "Doklad"}
              hint={scan.document?.originalName ?? scan.inboundAttachment?.originalName}
              actions={
                scan.document || scan.inboundAttachment ? (
                  <DocPreview
                    documentId={scan.document?.id}
                    url={scan.inboundAttachment ? `/api/mail/attachment/${scan.inboundAttachment.id}` : undefined}
                    name={scan.document?.originalName ?? scan.inboundAttachment?.originalName ?? "dokument"}
                    label="Zobrazit"
                  />
                ) : undefined
              }
            >
              <FormGrid cols={jeNabidka ? 2 : 3}>
                <Field label={jeNabidka ? "Název" : "Název výdaje"} htmlFor="ds-title">
                  <input id="ds-title" className={input} value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} />
                </Field>
                <Field label={jeNabidka ? "Číslo nabídky" : "Číslo dokladu"} htmlFor="ds-num">
                  <input id="ds-num" className={input} value={form.docNumber ?? ""} onChange={(e) => set("docNumber", e.target.value)} />
                </Field>
                {!jeNabidka && (
                <Field label="Kategorie" htmlFor="ds-cat">
                  <select id="ds-cat" className={input} value={form.category ?? "other"} onChange={(e) => set("category", e.target.value)}>
                    {categories.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                    {novaKat && <option value={`__new__:${novaKat}`}>{novaKat} (založit)</option>}
                  </select>
                </Field>
                )}
              </FormGrid>
              {/* DUZP a splatnost patří dokladu – nabídka se ještě neplatí. */}
              <FormGrid cols={jeNabidka ? 2 : 3}>
                <Field label={jeNabidka ? "Datum nabídky" : "Datum vystavení"} htmlFor="ds-date">
                  <input id="ds-date" type="date" className={input} value={form.date ?? ""} onChange={(e) => set("date", e.target.value)} />
                </Field>
                {!jeNabidka && (
                <Field label="DUZP" htmlFor="ds-tax">
                  <input id="ds-tax" type="date" className={input} value={form.taxDate ?? ""} onChange={(e) => set("taxDate", e.target.value)} />
                </Field>
                )}
                <Field label={jeNabidka ? "Platnost do" : "Splatnost"} htmlFor="ds-due">
                  <input id="ds-due" type="date" className={input} value={form.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value)} />
                </Field>
              </FormGrid>
            </FormSection>

            {form.direction === "issued" ? (
              <FormSection title="Odběratel" hint="komu jsem doklad vystavil">
                <FormGrid cols={3}>
                  <Field label="Název" htmlFor="ds-cust">
                    <input id="ds-cust" className={input} value={form.customerName ?? ""} onChange={(e) => set("customerName", e.target.value)} />
                  </Field>
                  <Field label="IČO" htmlFor="ds-cico">
                    <input id="ds-cico" className={input} value={form.customerIco ?? ""} onChange={(e) => set("customerIco", e.target.value)} />
                  </Field>
                  <Field label="DIČ" htmlFor="ds-cdic">
                    <input id="ds-cdic" className={input} value={form.customerDic ?? ""} onChange={(e) => set("customerDic", e.target.value)} />
                  </Field>
                </FormGrid>
              </FormSection>
            ) : (
            <FormSection title="Dodavatel" hint="IČO se ověří v ARESu; existující dodavatel se spáruje">
              <FormGrid cols={3}>
                <Field label="Název" htmlFor="ds-sup">
                  <input id="ds-sup" className={input} value={form.supplierName ?? ""} onChange={(e) => set("supplierName", e.target.value)} />
                </Field>
                <Field label="IČO" htmlFor="ds-ico">
                  <input id="ds-ico" className={input} value={form.supplierIco ?? ""} onChange={(e) => set("supplierIco", e.target.value)} />
                </Field>
                <Field label="DIČ" htmlFor="ds-dic">
                  <input id="ds-dic" className={input} value={form.supplierDic ?? ""} onChange={(e) => set("supplierDic", e.target.value)} />
                </Field>
                <Field label="Účet" htmlFor="ds-acc">
                  <input
                    id="ds-acc"
                    className={input}
                    value={form.supplierBankAccount ?? ""}
                    onChange={(e) => set("supplierBankAccount", e.target.value)}
                    placeholder="123456789/0100"
                  />
                </Field>
              </FormGrid>
              <FormGrid>
                <Field label="V evidenci" htmlFor="ds-vendor">
                  <select
                    id="ds-vendor"
                    className={input}
                    value={form.vendorId ?? ""}
                    onChange={(e) => {
                      const v = vendors.find((x) => x.id === e.target.value);
                      // Vybraný dodavatel je v evidenci, takže se nezakládá
                      // a jeho údaje přebijí odhad z dokladu.
                      setForm((f) => ({
                        ...f,
                        vendorId: e.target.value,
                        ...(v
                          ? {
                              createVendor: "0",
                              supplierName: v.name,
                              supplierIco: v.ico ?? "",
                              supplierDic: v.dic ?? "",
                              supplierBankAccount: v.bankAccount ?? f.supplierBankAccount ?? "",
                            }
                          : {}),
                      }));
                    }}
                  >
                    <option value="">— nepřiřazovat —</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.ico ? ` (${v.ico})` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    checked={form.createVendor === "1"}
                    disabled={!!form.vendorId}
                    onChange={(e) => set("createVendor", e.target.checked ? "1" : "0")}
                    className="size-4 accent-stone-900 disabled:opacity-50"
                  />
                  Založit dodavatele z ARESu, když v evidenci není
                </label>
              </FormGrid>
            </FormSection>
            )}

            <FormSection
              title={jeNabidka ? "Cena" : "Částky a DPH"}
              actions={
                rows.length > 0 && !jeNabidka ? (
                  <span className="text-xs text-stone-500">
                    rozpis celkem {formatCurrency(rowsTotal, form.currency || "CZK")}
                    {foreign && rate > 0 && (
                      <span className="ml-2 text-stone-500">
                        · v Kč {formatCurrency(rowsTotal * rate)} (základ {formatCurrency(rows.reduce((a, r) => a + r.base, 0) * rate)}, daň{" "}
                        {formatCurrency(rows.reduce((a, r) => a + r.vat, 0) * rate)})
                      </span>
                    )}
                  </span>
                ) : null
              }
            >
              <FormGrid cols={3}>
                <Field label="Celkem s DPH" htmlFor="ds-total">
                  <input id="ds-total" inputMode="decimal" className={input} value={form.total ?? ""} onChange={(e) => set("total", e.target.value)} />
                </Field>
                <Field label={jeNabidka ? "Cena bez DPH" : "Základ"} htmlFor="ds-base">
                  <input id="ds-base" inputMode="decimal" className={input} value={form.vatBase ?? ""} onChange={(e) => set("vatBase", e.target.value)} />
                </Field>
                {!jeNabidka && (
                <Field label="DPH" htmlFor="ds-vat">
                  <input id="ds-vat" inputMode="decimal" className={input} value={form.vatAmount ?? ""} onChange={(e) => set("vatAmount", e.target.value)} />
                </Field>
                )}
              </FormGrid>
              {rows.length > 0 && !jeNabidka && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-left text-stone-500">
                      <th className="py-1 font-medium">Sazba</th>
                      <th className="py-1 text-right font-medium">Základ</th>
                      <th className="py-1 text-right font-medium">Daň</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-stone-100">
                        <td className="py-1">{r.rate} %</td>
                        <td className="py-1 text-right font-mono">{formatCurrency(r.base, form.currency || "CZK")}</td>
                        <td className="py-1 text-right font-mono">{formatCurrency(r.vat, form.currency || "CZK")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <FormGrid cols={3}>
                <Field label="Měna" htmlFor="ds-cur">
                  <input id="ds-cur" className={input} value={form.currency ?? "CZK"} onChange={(e) => set("currency", e.target.value)} />
                </Field>
                {foreign && (
                  <Field label="Kurz (Kč za 1)" htmlFor="ds-rate" hint={scan.result?.rateNote ?? undefined}>
                    <input
                      id="ds-rate"
                      inputMode="decimal"
                      className={input}
                      value={form.exchangeRate ?? ""}
                      onChange={(e) => set("exchangeRate", e.target.value)}
                    />
                  </Field>
                )}
                {!jeNabidka && (
                <Field label="VS" htmlFor="ds-vs">
                  <input id="ds-vs" className={input} value={form.variableSymbol ?? ""} onChange={(e) => set("variableSymbol", e.target.value)} />
                </Field>
                )}
                {subProjects.length > 0 && (
                  <Field label="Složka" htmlFor="ds-sub">
                    <select id="ds-sub" className={input} value={form.subProjectId ?? ""} onChange={(e) => set("subProjectId", e.target.value)}>
                      <option value="">— projekt —</option>
                      {subProjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </FormGrid>
              <div className={`flex-wrap gap-4 text-sm text-stone-700 ${jeNabidka ? "hidden" : "flex"}`}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={form.paid === "1"} onChange={(e) => set("paid", e.target.checked ? "1" : "0")} className="size-4 accent-stone-900" />
                  {form.direction === "issued" ? "Už uhrazeno" : "Už zaplaceno"}
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.deductible !== "0"}
                    onChange={(e) => set("deductible", e.target.checked ? "1" : "0")}
                    className="size-4 accent-stone-900"
                  />
                  {form.direction === "issued" ? "Zahrnout do DPH (uskutečněné plnění)" : "Zahrnout do podkladu pro DPH"}
                </label>
              </div>
            </FormSection>

            {items.length > 0 && !jeNabidka && (
              <FormSection
                title={`Položky · ${items.length}`}
                hint={issuedDoc ? "uloží se k dokladu" : "odškrtni, co nepatří do přiznání"}
                actions={
                  <button type="button" onClick={() => setItems([])} className="cursor-pointer text-xs text-stone-500 hover:text-stone-950">
                    Neukládat položky
                  </button>
                }
              >
                <div className="max-h-72 overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-stone-200 text-left text-stone-500">
                        {!issuedDoc && <th className="w-10 py-1 text-center font-medium">DPH</th>}
                        <th className="py-1 font-medium">Popis</th>
                        <th className="py-1 font-medium">Kategorie</th>
                        <th className="py-1 text-right font-medium">Množství</th>
                        <th className="py-1 text-right font-medium">Sazba</th>
                        <th className="py-1 text-right font-medium">Částka</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i, idx) => (
                        <tr key={idx} className={`border-b border-stone-100 ${i.deductible === false ? "text-stone-400" : ""}`}>
                          {!issuedDoc && (
                            <td className="py-1 text-center">
                              <input
                                type="checkbox"
                                checked={i.deductible !== false}
                                onChange={(e) => setItem(idx, { deductible: e.target.checked })}
                                aria-label={`Do přiznání: ${i.description}`}
                                className="size-4 accent-stone-900"
                              />
                            </td>
                          )}
                          <td className="py-1 pr-2">
                            {i.description}
                            {/* Proč položka není v nároku – ať jde návrh zkontrolovat. */}
                            {i.deductible === false && i.deductibleNote && (
                              <span className="block text-[11px] text-stone-500">{i.deductibleNote}</span>
                            )}
                          </td>
                          <td className="py-1 pr-2">
                            <select
                              value={katKlic(i.category) ?? ""}
                              onChange={(e) => setItem(idx, { category: e.target.value || null })}
                              aria-label={`Kategorie: ${i.description}`}
                              className="h-7 w-full max-w-36 cursor-pointer border border-stone-200 bg-white px-1 text-xs text-stone-700 focus-visible:border-stone-950 focus-visible:outline-none"
                            >
                              <option value="">—</option>
                              {categories.map((c) => (
                                <option key={c.key} value={c.key}>
                                  {c.label}
                                </option>
                              ))}
                              {novaKat && <option value={`__new__:${novaKat}`}>{novaKat} (založit)</option>}
                            </select>
                          </td>
                          <td className="py-1 text-right whitespace-nowrap">
                            {i.quantity != null ? `${i.quantity.toLocaleString("cs-CZ")} ${i.unit ?? ""}` : "–"}
                          </td>
                          <td className="py-1 text-right whitespace-nowrap">{i.vatRate != null ? `${i.vatRate} %` : "–"}</td>
                          <td className="py-1 text-right font-mono">{formatCurrency(i.amount, form.currency || "CZK")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {kraceno && (
                  <p className="mt-2 border-t border-stone-200 pt-2 text-xs text-stone-600">
                    Do přiznání jde základ{" "}
                    <span className="font-mono text-stone-950">{formatCurrency(claim.base, form.currency || "CZK")}</span> a daň{" "}
                    <span className="font-mono text-stone-950">{formatCurrency(claim.vat, form.currency || "CZK")}</span>
                    {claim.rows.length > 0 && (
                      <> · {claim.rows.map((r) => `${r.rate} %`).join(", ")}</>
                    )}
                  </p>
                )}
              </FormSection>
            )}

            <FormSection title="Poznámka">
              <textarea
                rows={2}
                className={`${input} h-auto py-2`}
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
              />
            </FormSection>
            {err && <p className="text-sm text-red-600">{err}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                const fd = new FormData();
                fd.set("id", scan.id);
                await dismissDocScan(fd);
                setOpen(false);
                router.refresh();
                onDone?.("done");
              }}
            >
              Zahodit návrh
            </Button>
            <Button
              type="button"
              onClick={jeNabidka ? applyOffer : apply}
              disabled={
                busy ||
                (!jeNabidka && !!scan.duplicate && !force) ||
                (jeNabidka && vybrane.length === 0 && !novaZadanka)
              }
            >
              {busy
                ? "Zakládám…"
                : jeNabidka
                  ? `Založit nabídku${
                      vybrane.length > 1 ? ` (${vybrane.length} žádanky)` : novaZadanka ? " a žádanku" : ""
                    }`
                  : form.direction === "issued"
                    ? "Založit příjem"
                    : "Založit výdaj"}
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
