"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Paperclip } from "lucide-react";
import { myReceipts, uploadReceipt } from "@/server/actions/doc-scan";
import { processDocumentPhoto, type PhotoQuality } from "@/lib/image-clean";
import { prepareUpload } from "@/lib/client-upload";
import { formatCurrency, formatDate } from "@/lib/utils";

type Project = { id: string; name: string; autoRead: boolean };
type Mine = Awaited<ReturnType<typeof myReceipts>>;

const STATUS: Record<string, { label: string; cls: string }> = {
  uploaded: { label: "odesláno ke zpracování", cls: "text-stone-500" },
  running: { label: "čtu doklad…", cls: "text-stone-500" },
  ready: { label: "přečteno, čeká na zaúčtování", cls: "text-orange-700" },
  applied: { label: "zaúčtováno", cls: "text-emerald-700" },
  dismissed: { label: "zahozeno", cls: "text-stone-400" },
  error: { label: "zpracuje majitel projektu", cls: "text-stone-500" },
};

const QUALITY_STYLE: Record<PhotoQuality["level"], string> = {
  ok: "text-emerald-700",
  borderline: "text-amber-700",
  bad: "text-red-600",
};

/**
 * Doklad od dodavatele: vyfotí účtenku telefonem (nebo vybere PDF) a je hotovo.
 * Fotka se ořízne, zkontroluje se, že není rozmazaná, a pošle se do projektu –
 * dál ji zpracuje majitel projektu. Nic dalšího dodavatel nevyplňuje.
 */
export function ReceiptScan({
  projects,
  initial,
  compact = false,
}: {
  projects: Project[];
  initial: Mine;
  /** V projektu: jen tlačítka a náhled, seznam dokladů je hned pod tím. */
  compact?: boolean;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mine, setMine] = useState<Mine>(initial);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // co se chystá odeslat – u fotky napřed náhled (ořez papíru a kontrola ostrosti)
  const [pending, setPending] = useState<{
    original: File;
    ready: File;
    preview: string | null;
    cropped: boolean;
    quality: PhotoQuality | null;
  } | null>(null);

  const autoRead = projects.find((p) => p.id === projectId)?.autoRead ?? false;

  // dokud se něco čte, koukni po pár vteřinách, jestli je hotovo
  useEffect(() => {
    if (!mine.some((m) => m.status === "running")) return;
    const t = setInterval(async () => setMine(await myReceipts().catch(() => mine)), 5000);
    return () => clearInterval(t);
  }, [mine]);

  /** Jedna fotka → náhled s ořezem a kontrolou; víc souborů nebo PDF jde rovnou. */
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
      setPending({ original: list[0], ready: r.file, preview: r.preview, cropped: r.cropped, quality: r.quality });
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
      const kolik = items.length > 1 ? `${items.length} dokladů` : "Doklad";
      setMsg(autoRead ? `${kolik} odeslán, čtu…` : `${kolik} odeslán ke zpracování.`);
      setPending(null);
      setMine(await myReceipts());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nepodařilo se odeslat.");
    }
    setBusy(false);
  }

  if (!projects.length) return null;

  const bad = pending?.quality?.level === "bad";

  return (
    <section className={compact ? "" : "mb-6 border border-stone-200 bg-white p-3 shadow-soft"}>
      <div className="flex flex-wrap items-center gap-2">
        {!compact && <h2 className="kicker mr-1">Účtenka / faktura</h2>}
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
          className={`flex cursor-pointer items-center justify-center gap-2 border border-stone-950 bg-stone-950 px-4 text-sm text-white transition-colors hover:bg-stone-800 disabled:opacity-60 sm:flex-none ${
            compact ? "h-10" : "h-11 flex-1"
          }`}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          {busy ? "Odesílám…" : "Vyfotit účtenku"}
        </button>
        <button
          type="button"
          disabled={busy}
          hidden={compact}
          onClick={() => fileRef.current?.click()}
          className="flex h-11 cursor-pointer items-center gap-2 border border-stone-300 px-3 text-sm text-stone-700 transition-colors hover:border-stone-950 disabled:opacity-60 [&[hidden]]:hidden"
        >
          <Paperclip className="size-4" /> Vybrat soubor
        </button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files)} />
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
      </div>
      {!compact && (
        <p className="mt-2 text-[11px] text-stone-400">
          {autoRead ? "Doklad se přečte a připraví ke kontrole." : "Doklad se pošle majiteli projektu ke zpracování."}
        </p>
      )}

      {pending && (
        <div className="mt-3 border border-stone-200 p-3">
          <div className="flex flex-wrap items-start gap-3">
            {pending.preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pending.preview} alt="Náhled dokladu" className="max-h-64 w-auto border border-stone-200" />
            )}
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              {pending.quality && (
                <p className={`font-medium ${QUALITY_STYLE[pending.quality.level]}`}>
                  {pending.quality.level === "ok" ? "Fotka je ostrá a čitelná." : pending.quality.note}
                </p>
              )}
              <p className="text-stone-700">
                {pending.cropped ? "Doklad jsem našel, ořízl a narovnal." : "Papír se nepodařilo najít – fotka se jen zmenšila."}
                <span className="block text-xs text-stone-500">
                  {Math.round(pending.original.size / 1024)} kB → {Math.round(pending.ready.size / 1024)} kB
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {bad ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setPending(null);
                        camRef.current?.click();
                      }}
                      className="h-9 cursor-pointer border border-stone-950 bg-stone-950 px-3 text-sm text-white disabled:opacity-60"
                    >
                      Vyfotit znovu
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => send([{ file: pending.original }])}
                      className="h-9 cursor-pointer border border-stone-300 px-3 text-sm text-stone-700 hover:border-stone-950 disabled:opacity-60"
                    >
                      Přesto odeslat
                    </button>
                  </>
                ) : (
                  <>
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
                  </>
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

      {!compact && mine.length > 0 && (
        <ul className="mt-3 border-t border-stone-200">
          {mine.map((m) => {
            const st = STATUS[m.done ? "applied" : m.status] ?? STATUS.uploaded;
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
