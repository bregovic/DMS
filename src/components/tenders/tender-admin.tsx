"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, Mail, Trash2, X } from "lucide-react";
import { useFormAction } from "@/components/ui/use-form-action";
import { Dialog } from "@/components/ui/dialog";
import { CopyButton } from "@/components/portal/copy-button";
import { compressImage } from "@/lib/client-upload";
import {
  addGalleryPhotos,
  addInvites,
  deleteInvite,
  markInvitesSent,
  removeGalleryPhoto,
  saveSubmissionReply,
  toggleInviteSent,
  updateRequestBrief,
  updateTender,
} from "@/server/actions/tenders";

const field =
  "flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:border-stone-950 focus-visible:outline-none";
const lbl = "kicker mb-1.5 block";
const btn =
  "inline-flex h-9 items-center gap-1.5 bg-stone-950 px-4 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 cursor-pointer";
const btnOutline =
  "inline-flex h-9 items-center gap-1.5 border border-stone-300 bg-white px-3 text-sm text-stone-700 hover:border-stone-950 hover:text-stone-950 disabled:opacity-50 cursor-pointer";

type State = { error?: string; ok?: boolean } | undefined;

function Saved({ state, pending }: { state: State; pending: boolean }) {
  if (pending) return <span className="text-xs text-stone-500">Ukládám…</span>;
  if (state?.error) return <span className="text-xs text-red-700">{state.error}</span>;
  if (state?.ok) return <span className="text-xs text-stone-500">Uloženo</span>;
  return null;
}

// ---------------------------------------------------------------------------

export function TenderSettingsForm({
  tender,
}: {
  tender: { id: string; title: string; intro: string | null; location: string | null; contact: string | null; deadline: string | null };
}) {
  const [state, action, pending] = useFormAction<State>(updateTender, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={tender.id} />
      <div>
        <label className={lbl}>Název</label>
        <input name="title" defaultValue={tender.title} required className={field} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={lbl}>Místo</label>
          <input name="location" defaultValue={tender.location ?? ""} placeholder="Praha – Letňany" className={field} />
        </div>
        <div>
          <label className={lbl}>Nabídky do</label>
          <input type="date" name="deadline" defaultValue={tender.deadline ?? ""} className={field} />
        </div>
        <div>
          <label className={lbl}>Kontakt</label>
          <input name="contact" defaultValue={tender.contact ?? ""} className={field} />
        </div>
      </div>
      <div>
        <label className={lbl}>Úvodní text</label>
        <textarea name="intro" rows={4} defaultValue={tender.intro ?? ""} className={field} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btn}>
          Uložit
        </button>
        <Saved state={state} pending={pending} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

export function RequestBriefForm({
  tenderId,
  request,
}: {
  tenderId: string;
  request: {
    id: string;
    description: string | null;
    quantity: number | null;
    unit: string;
    requiredDate: string | null;
    fieldsText: string;
  };
}) {
  const [state, action, pending] = useFormAction<State>(updateRequestBrief, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenderId" value={tenderId} />
      <input type="hidden" name="requestId" value={request.id} />
      <div>
        <label className={lbl}>Specifikace</label>
        <textarea name="description" rows={5} defaultValue={request.description ?? ""} className={field} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className={lbl}>Množství</label>
          <input name="quantity" inputMode="decimal" defaultValue={request.quantity ?? ""} className={field} />
        </div>
        <div>
          <label className={lbl}>Jednotka</label>
          <input name="unit" defaultValue={request.unit} className={field} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Potřebujeme do</label>
          <input type="date" name="requiredDate" defaultValue={request.requiredDate ?? ""} className={field} />
        </div>
      </div>
      <div>
        <label className={lbl}>Údaje k vyplnění v nabídce</label>
        <textarea
          name="offerFields"
          rows={4}
          defaultValue={request.fieldsText}
          placeholder={"Výrobce a profil *\nUw [W/m²K]\nZasklení\nMontáž v ceně"}
          className={`${field} font-mono text-xs`}
        />
        <p className="mt-1 text-xs text-stone-500">Jeden údaj na řádek, jednotka v [ ], povinný údaj s * na konci.</p>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btn}>
          Uložit zadání
        </button>
        <Saved state={state} pending={pending} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

export function GalleryManager({
  tenderId,
  requestId,
  photos,
}: {
  tenderId: string;
  requestId: string;
  photos: { id: string; name: string }[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const fd = new FormData();
    fd.set("tenderId", tenderId);
    fd.set("requestId", requestId);
    let total = 0;
    for (const f of Array.from(list).slice(0, 20)) {
      const c = await compressImage(f);
      total += c.size;
      fd.append("file", c);
    }
    if (total > 14 * 1024 * 1024) {
      setError("Fotky jsou dohromady moc velké, nahraj je po částech.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await addGalleryPhotos(fd);
        if (res.error) setError(res.error);
      } catch {
        setError("Nahrání se nepovedlo.");
      }
      if (input.current) input.current.value = "";
    });
  }

  return (
    <div>
      <p className={lbl}>Fotky pro dodavatele · {photos.length}</p>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {photos.map((p) => (
          <div key={p.id} className="group relative aspect-[4/3] overflow-hidden bg-stone-100">
            <a href={`/api/documents/${p.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/documents/${p.id}`} alt={p.name} loading="lazy" className="size-full object-cover" />
            </a>
            <form
              action={removeGalleryPhoto}
              onSubmit={(e) => {
                if (!window.confirm("Odebrat fotku?")) e.preventDefault();
              }}
              className="absolute right-1 top-1"
            >
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="tenderId" value={tenderId} />
              <button
                type="submit"
                aria-label="Odebrat fotku"
                className="flex size-8 items-center justify-center bg-white/90 text-stone-700 opacity-100 hover:bg-stone-950 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
              >
                <Trash2 className="size-3.5" />
              </button>
            </form>
          </div>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-1 border border-dashed border-stone-400 text-xs text-stone-500 hover:border-stone-950 hover:text-stone-950 cursor-pointer"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          Přidat
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => upload(e.target.files)}
      />
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

type VendorOpt = { id: string; name: string; email: string | null; category: string; stats: string | null };

export function InviteAdder({ tenderId, vendors }: { tenderId: string; vendors: VendorOpt[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const list = useMemo(
    () => vendors.filter((v) => !q || norm(`${v.name} ${v.email ?? ""} ${v.category}`).includes(norm(q))),
    [q, vendors],
  );

  function submit(fd: FormData) {
    setError(null);
    for (const id of picked) fd.append("vendorId", id);
    if (!picked.size && !String(fd.get("name") || "").trim() && !String(fd.get("email") || "").trim()) {
      setError("Vyber dodavatele nebo vyplň kontakt.");
      return;
    }
    startTransition(async () => {
      try {
        await addInvites(fd);
        setPicked(new Set());
        setOpen(false);
      } catch {
        setError("Uložení se nepovedlo. Načti stránku znovu.");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnOutline}>
        Oslovit dodavatele
      </button>
      {open && (
        <Dialog title="Oslovit dodavatele" onClose={() => setOpen(false)} size="xl">
          <form action={submit} className="space-y-5">
            <input type="hidden" name="id" value={tenderId} />
            <div>
              <label className={lbl}>Z evidence</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat" className={field} />
              <ul className="mt-2 max-h-72 overflow-y-auto border border-stone-200">
                {list.length === 0 && <li className="px-3 py-3 text-sm text-stone-500">Nic nenalezeno.</li>}
                {list.map((v) => (
                  <li key={v.id} className="border-b border-stone-100 last:border-0">
                    <label className="flex cursor-pointer items-baseline gap-3 px-3 py-2 hover:bg-stone-50">
                      <input
                        type="checkbox"
                        checked={picked.has(v.id)}
                        onChange={(e) => {
                          const n = new Set(picked);
                          if (e.target.checked) n.add(v.id);
                          else n.delete(v.id);
                          setPicked(n);
                        }}
                        className="size-4 translate-y-0.5 accent-stone-950"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm text-stone-900">{v.name}</span>
                        <span className="block text-xs text-stone-500">
                          {v.email ?? "bez e-mailu"}
                          {v.stats ? ` · ${v.stats}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className={lbl}>Nový kontakt</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input name="name" placeholder="Firma" className={field} />
                <input name="email" type="email" placeholder="E-mail" className={field} />
              </div>
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={btnOutline}>
                Zrušit
              </button>
              <button type="submit" disabled={pending} className={btn}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Přidat{picked.size ? ` (${picked.size})` : ""}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

/** Předmět a text e-mailu ke zkopírování, odkaz do pošty. */
export function EmailDraft({
  to,
  toLabel = "Komu",
  subject,
  body,
  trigger,
  markSent,
}: {
  to: string | null;
  toLabel?: string;
  subject: string;
  body: string;
  trigger: string;
  markSent?: { tenderId: string; count: number };
}) {
  const [open, setOpen] = useState(false);
  const mailto = `mailto:${markSent ? "" : (to ?? "")}?${markSent && to ? `bcc=${encodeURIComponent(to)}&` : ""}subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnOutline}>
        <Mail className="size-3.5" />
        {trigger}
      </button>
      {open && (
        <Dialog title="E-mail" onClose={() => setOpen(false)} size="2xl">
          <div className="space-y-4">
            {to && (
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm">
                  <span className="kicker mr-2">{toLabel}</span>
                  {to}
                </p>
                <CopyButton text={to} label="Kopírovat" />
              </div>
            )}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="kicker">Předmět</span>
                <CopyButton text={subject} label="Kopírovat předmět" />
              </div>
              <p className="border border-stone-200 bg-stone-50 px-3 py-2 text-sm">{subject}</p>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="kicker">Text</span>
                <CopyButton text={body} label="Kopírovat text" />
              </div>
              <pre className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap border border-stone-200 bg-stone-50 px-3 py-2 font-sans text-sm text-stone-800">
                {body}
              </pre>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <a href={mailto} className={btnOutline}>
                Otevřít v poště
              </a>
              {markSent && (
                <form action={markInvitesSent} onSubmit={() => setOpen(false)}>
                  <input type="hidden" name="id" value={markSent.tenderId} />
                  <button type="submit" className={btn}>
                    Označit jako odeslané ({markSent.count})
                  </button>
                </form>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function InviteRowActions({ inviteId, sent }: { inviteId: string; sent: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {sent && (
        <form action={toggleInviteSent}>
          <input type="hidden" name="id" value={inviteId} />
          <input type="hidden" name="sent" value="0" />
          <button type="submit" title="Zrušit označení odeslání" className="px-2 text-xs text-stone-400 hover:text-stone-950 cursor-pointer">
            neodesláno
          </button>
        </form>
      )}
      <form
        action={deleteInvite}
        onSubmit={(e) => {
          if (!window.confirm("Odebrat ze seznamu oslovených?")) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={inviteId} />
        <button type="submit" aria-label="Odebrat ze seznamu" className="flex size-8 items-center justify-center text-stone-400 hover:bg-stone-950 hover:text-white cursor-pointer">
          <X className="size-4" />
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ReplyForm({
  submissionId,
  reply,
  draft,
  published,
}: {
  submissionId: string;
  reply: string | null;
  draft: string;
  published: boolean;
}) {
  const [state, action, pending] = useFormAction<State>(saveSubmissionReply, undefined);
  const [text, setText] = useState(reply ?? draft);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={submissionId} />
      <div className="flex items-center justify-between">
        <span className="kicker">Odpověď{published ? " · zveřejněná" : ""}</span>
        {text !== draft && (
          <button type="button" onClick={() => setText(draft)} className="text-xs text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline cursor-pointer">
            Podle výběru
          </button>
        )}
      </div>
      <textarea name="reply" rows={6} value={text} onChange={(e) => setText(e.target.value)} className={field} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" name="publish" value="1" disabled={pending} className={btn}>
          {published ? "Uložit a zveřejnit" : "Zveřejnit dodavateli"}
        </button>
        <button type="submit" name="publish" value="" disabled={pending} className={btnOutline}>
          Uložit
        </button>
        {published && (
          <button type="submit" name="publish" value="0" disabled={pending} className={btnOutline}>
            Skrýt
          </button>
        )}
        <Saved state={state} pending={pending} />
      </div>
    </form>
  );
}
