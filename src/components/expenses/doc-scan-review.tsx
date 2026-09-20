"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, Loader2 } from "lucide-react";
import { applyDocScan, dismissDocScan, getDocScan, scanDocument, vendorsForScan } from "@/server/actions/doc-scan";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, FormSection } from "@/components/ui/form-section";
import { formatCurrency } from "@/lib/utils";
import type { ScanResult } from "@/server/doc-scan";

const input =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none";

type Vendor = { id: string; name: string; ico: string | null };

/**
 * Kontrola vytěženého dokladu: co systém přečetl, uživatel opraví a potvrdí –
 * teprve tím vznikne výdaj s daňovými údaji a položkami.
 */
export function DocScanReview({
  scanId,
  documentId,
  projectId,
  subProjects = [],
  categories,
  label = "Zkontrolovat doklad",
  autoOpen = false,
}: {
  scanId: string | null;
  documentId: string;
  projectId: string;
  subProjects?: { id: string; name: string }[];
  categories: { key: string; label: string }[];
  label?: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scan, setScan] = useState<Awaited<ReturnType<typeof getDocScan>> | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ScanResult["items"]>([]);
  const [rows, setRows] = useState<ScanResult["vatBreakdown"]>([]);
  const router = useRouter();

  async function load(id: string) {
    const s = await getDocScan(id);
    setScan(s);
    const r = s.result;
    if (r) {
      const issued = s.direction === "issued";
      setItems(r.items ?? []);
      setRows(r.vatBreakdown ?? []);
      const match = vendors.find((v) => (r.supplier.ico && v.ico === r.supplier.ico) || v.name === r.supplier.name);
      setForm({
        title: r.title ?? r.supplier.name ?? "Doklad",
        description: r.summary ?? "",
        direction: issued ? "issued" : "received",
        supplierName: r.supplier.name ?? "",
        supplierIco: r.supplier.ico ?? "",
        supplierDic: r.supplier.dic ?? "",
        customerName: r.customer?.name ?? "",
        customerIco: r.customer?.ico ?? "",
        customerDic: r.customer?.dic ?? "",
        vendorId: match?.id ?? "",
        createVendor: match ? "0" : "1",
        docNumber: r.number ?? "",
        date: r.issueDate ?? "",
        taxDate: r.taxDate ?? r.issueDate ?? "",
        dueDate: r.dueDate ?? "",
        variableSymbol: r.variableSymbol ?? "",
        currency: r.currency || "CZK",
        total: String(r.total ?? ""),
        vatBase: String(r.totalBase ?? ""),
        vatAmount: String(r.totalVat ?? ""),
        category: issued ? "prodej" : "other",
        subProjectId: "",
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
        let id = scanId;
        if (!id) {
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
      if (force) fd.set("force", "1");
      fd.set("items", JSON.stringify(items));
      await applyDocScan(fd);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Výdaj se nepodařilo založit.");
    }
    setBusy(false);
  }

  if (!open)
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileSearch className="size-4" /> {label}
      </Button>
    );

  const running = !scan || scan.status === "running";
  return (
    <Dialog title="Doklad – kontrola vytěžených údajů" size="3xl" onClose={() => setOpen(false)}>
      {running ? (
        <div className="flex items-center gap-2 p-6 text-sm text-stone-600">
          <Loader2 className="size-4 animate-spin" /> Čtu doklad… (do minuty)
        </div>
      ) : scan.status === "error" ? (
        <div className="space-y-3 p-5">
          <p className="text-sm text-red-600">{scan.error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              const fd = new FormData();
              fd.set("documentId", documentId);
              const { id } = await scanDocument(fd);
              await load(id);
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

            <FormSection title="Doklad" hint={scan.document.originalName}>
              <FormGrid cols={3}>
                <Field label="Název výdaje" htmlFor="ds-title">
                  <input id="ds-title" className={input} value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} />
                </Field>
                <Field label="Číslo dokladu" htmlFor="ds-num">
                  <input id="ds-num" className={input} value={form.docNumber ?? ""} onChange={(e) => set("docNumber", e.target.value)} />
                </Field>
                <Field label="Kategorie" htmlFor="ds-cat">
                  <select id="ds-cat" className={input} value={form.category ?? "other"} onChange={(e) => set("category", e.target.value)}>
                    {categories.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </FormGrid>
              <FormGrid cols={3}>
                <Field label="Datum vystavení" htmlFor="ds-date">
                  <input id="ds-date" type="date" className={input} value={form.date ?? ""} onChange={(e) => set("date", e.target.value)} />
                </Field>
                <Field label="DUZP" htmlFor="ds-tax" hint="datum zdanitelného plnění">
                  <input id="ds-tax" type="date" className={input} value={form.taxDate ?? ""} onChange={(e) => set("taxDate", e.target.value)} />
                </Field>
                <Field label="Splatnost" htmlFor="ds-due">
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
              </FormGrid>
              <FormGrid>
                <Field label="V evidenci" htmlFor="ds-vendor">
                  <select id="ds-vendor" className={input} value={form.vendorId ?? ""} onChange={(e) => set("vendorId", e.target.value)}>
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
                    onChange={(e) => set("createVendor", e.target.checked ? "1" : "0")}
                    className="size-4 accent-stone-900"
                  />
                  Založit dodavatele z ARESu, když v evidenci není
                </label>
              </FormGrid>
            </FormSection>
            )}

            <FormSection
              title="Částky a DPH"
              actions={
                rows.length > 0 ? (
                  <span className="text-xs text-stone-500">
                    rozpis celkem {formatCurrency(rowsTotal, form.currency || "CZK")}
                  </span>
                ) : null
              }
            >
              <FormGrid cols={3}>
                <Field label="Celkem s DPH" htmlFor="ds-total">
                  <input id="ds-total" inputMode="decimal" className={input} value={form.total ?? ""} onChange={(e) => set("total", e.target.value)} />
                </Field>
                <Field label="Základ" htmlFor="ds-base">
                  <input id="ds-base" inputMode="decimal" className={input} value={form.vatBase ?? ""} onChange={(e) => set("vatBase", e.target.value)} />
                </Field>
                <Field label="DPH" htmlFor="ds-vat">
                  <input id="ds-vat" inputMode="decimal" className={input} value={form.vatAmount ?? ""} onChange={(e) => set("vatAmount", e.target.value)} />
                </Field>
              </FormGrid>
              {rows.length > 0 && (
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
                <Field label="VS" htmlFor="ds-vs">
                  <input id="ds-vs" className={input} value={form.variableSymbol ?? ""} onChange={(e) => set("variableSymbol", e.target.value)} />
                </Field>
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
              <div className="flex flex-wrap gap-4 text-sm text-stone-700">
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

            {items.length > 0 && (
              <FormSection
                title={`Položky · ${items.length}`}
                hint="uloží se k výdaji a slouží k porovnání cen s katalogem"
                actions={
                  <button type="button" onClick={() => setItems([])} className="cursor-pointer text-xs text-stone-500 hover:text-stone-950">
                    Neukládat položky
                  </button>
                }
              >
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-stone-200 text-left text-stone-500">
                        <th className="py-1 font-medium">Popis</th>
                        <th className="py-1 text-right font-medium">Množství</th>
                        <th className="py-1 text-right font-medium">Jedn. cena</th>
                        <th className="py-1 text-right font-medium">Částka</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i, idx) => (
                        <tr key={idx} className="border-b border-stone-100">
                          <td className="py-1 pr-2">{i.description}</td>
                          <td className="py-1 text-right whitespace-nowrap">
                            {i.quantity != null ? `${i.quantity.toLocaleString("cs-CZ")} ${i.unit ?? ""}` : "–"}
                          </td>
                          <td className="py-1 text-right font-mono">{i.unitPrice != null ? formatCurrency(i.unitPrice, form.currency || "CZK") : "–"}</td>
                          <td className="py-1 text-right font-mono">{formatCurrency(i.amount, form.currency || "CZK")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
              }}
            >
              Zahodit návrh
            </Button>
            <Button type="button" onClick={apply} disabled={busy || (!!scan.duplicate && !force)}>
              {busy ? "Zakládám…" : form.direction === "issued" ? "Založit příjem" : "Založit výdaj"}
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
