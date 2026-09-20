"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Paperclip } from "lucide-react";
import { myReceipts, uploadReceipt } from "@/server/actions/doc-scan";
import { processDocumentPhoto } from "@/lib/image-clean";
import { prepareUpload } from "@/lib/client-upload";
import { formatCurrency, formatDate } from "@/lib/utils";

type Project = { id: string; name: string };
type Mine = Awaited<ReturnType<typeof myReceipts>>;

const STATUS: Record<string, { label: string; cls: string }> = {
  running: { label: "čtu doklad…", cls: "text-stone-500" },
  ready: { label: "přečteno, čeká na zaúčtování", cls: "text-orange-700" },
  applied: { label: "zaúčtováno", cls: "text-emerald-700" },
  dismissed: { label: "zahozeno", cls: "text-stone-400" },
  error: { label: "nepodařilo se přečíst", cls: "text-red-600" },
};

/**
 * Doklad od dodavatele: vyfotí účtenku telefonem (nebo vybere PDF), systém
 * ji přečte a správci projektu se objeví mezi doklady ke kontrole.
 * Dodavatel nic dalšího nevyplňuje – jen vybere projekt.
 */
export function ReceiptScan({ projects, initial }: { projects: Project[]; initial: Mine }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mine, setMine] = useState<Mine>(initial);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // co se chystá odeslat – u fotky napřed náhled (ořez papíru a vyčištění)
  const [pending, setPending] = useState<{ original: File; ready: File; preview: string | null; cropped: boolean } | null>(null);

  // dokud se něco čte, koukni po pár vteřinách, jestli je hotovo
  useEffect(() => {
    if (!mine.some((m) => m.status === "running")) return;
    const t = setInterval(async () => setMine(await myReceipts().catch(() => mine)), 5000);
    return () => clearInterval(t);
  }, [mine]);

  /** Jedna fotka → náhled s ořezem; víc souborů nebo PDF jde rovnou. */
  async function pick(files: FileList | null) {
    const list = [...(files ?? [])];
    if (!list.length || !projectId) return;
    if (camRef.current) camRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
    if (list.length === 1 && list[0].type.startsWith("image/")) {
      setBusy(true);
      setErr(null);
      setMsg(null);
      const r = await processDocumentPhoto(list[0], { crop: true });
      setBusy(false);
      setPending({ original: list[0], ready: r.file, preview: r.preview, cropped: r.cropped });
      return;
    }
    await send(list.map((f) => ({ file: f })));
  }

  async function send(items: { file: File; crop?: boolean }[]) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      for (const it of items) {
        const fd = new FormData();
        fd.set("projectId", projectId);
        fd.set("file", await prepareUpload(it.file, { doc: true, crop: it.crop !== false }));
        await uploadReceipt(fd);
      }
      setMsg(items.length > 1 ? `Odesláno ${items.length} dokladů, čtu je…` : "Odesláno, čtu doklad…");
      setPending(null);
      setMine(await myReceipts());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nepodařilo se odeslat.");
    }
    setBusy(false);
  }

  if (!projects.length) return null;

  return (
    <section className="mb-6 border border-stone-200 bg-white p-3 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="kicker mr-1">Účtenka / faktura</h2>
        {projects.length > 1 && (
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Projekt"
            className="h-9 rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-700 focus-visible:border-stone-950 focus-visible:outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => camRef.current?.click()}
          className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 border border-stone-950 bg-stone-950 px-4 text-sm text-white transition-colors hover:bg-stone-800 disabled:opacity-60 sm:flex-none"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          {busy ? "Odesílám…" : "Vyfotit účtenku"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex h-11 cursor-pointer items-center gap-2 border border-stone-300 px-3 text-sm text-stone-700 transition-colors hover:border-stone-950 disabled:opacity-60"
        >
          <Paperclip className="size-4" /> Vybrat soubor
        </button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files)} />
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
      </div>
      <p className="mt-2 text-[11px] text-stone-400">
        Vyfoť účtenku nebo vyber PDF faktury. Systém z ní přečte dodavatele, částku, DPH i položky a pošle ji majiteli
        projektu ke kontrole – nic dalšího vyplňovat nemusíš.
      </p>
      {pending && (
        <div className="mt-3 border border-stone-200 p-3">
          <div className="flex flex-wrap items-start gap-3">
            {pending.preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pending.preview} alt="Náhled dokladu" className="max-h-64 w-auto border border-stone-200" />
            )}
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <p className="text-stone-700">
                {pending.cropped ? "Doklad jsem našel, ořízl a narovnal." : "Papír se nepodařilo najít – fotka se jen zmenšila."}
                <span className="block text-xs text-stone-500">
                  {Math.round(pending.original.size / 1024)} kB → {Math.round(pending.ready.size / 1024)} kB
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => send([{ file: pending.original }])}
                  className="h-9 cursor-pointer border border-stone-950 bg-stone-950 px-3 text-sm text-white disabled:opacity-60"
                >
                  Odeslat
                </button>
                {pending.cropped && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => send([{ file: pending.original, crop: false }])}
                    className="h-9 cursor-pointer border border-stone-300 px-3 text-sm text-stone-700 hover:border-stone-950 disabled:opacity-60"
                  >
                    Bez ořezu
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPending(null)}
                  className="h-9 cursor-pointer px-3 text-sm text-stone-500 hover:text-stone-950 disabled:opacity-60"
                >
                  Zahodit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-emerald-700">{msg}</p>}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}

      {mine.length > 0 && (
        <ul className="mt-3 border-t border-stone-200">
          {mine.map((m) => {
            const st = STATUS[m.done ? "applied" : m.status] ?? STATUS.running;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-100 py-2 text-sm last:border-0">
                <span className="min-w-0 flex-1 basis-40 truncate text-stone-900" title={m.fileName}>
                  {m.supplier ?? m.fileName}
                  <span className="text-xs text-stone-400"> · {m.project}</span>
                </span>
                <span className="text-xs text-stone-400">{formatDate(m.createdAt)}</span>
                {m.total != null && <span className="font-mono text-stone-950">{formatCurrency(m.total)}</span>}
                <span className={`w-48 text-right text-xs ${st.cls}`}>{st.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
