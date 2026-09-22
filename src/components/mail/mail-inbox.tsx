"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Mail, Paperclip, RefreshCw, X } from "lucide-react";
import { deleteMail, dismissMail, fileMail, projectOptions, runMailbox } from "@/server/actions/inbound";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DeleteButton } from "@/components/ui/delete-button";
import { formatDate } from "@/lib/utils";

type ProjectOptions = {
  folders: { id: string; name: string }[];
  requests: { id: string; title: string; subProjectId: string | null }[];
};

const PRAZDNE: ProjectOptions = { folders: [], requests: [] };

export type MailView = {
  id: string;
  fromName: string | null;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  bodyText: string | null;
  status: string;
  note: string | null;
  projectId: string | null;
  subProjectId: string | null;
  requestId: string | null;
  /** Poptávky navržené z obsahu – nabídka jich bývá na víc. */
  requestIds: string[];
  reason: string | null;
  confidence: number | null;
  attachments: { id: string; originalName: string; size: number; kind: string; documentId: string | null }[];
};

const KINDS = [
  { value: "offer", label: "Nabídka" },
  { value: "invoice", label: "Faktura" },
  { value: "technical", label: "Technický list" },
  { value: "other", label: "Ostatní" },
];

const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? "Ostatní";
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} kB`;

const selectClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none";

/** Dialog zařazení: projekt, složka, žádanka a které přílohy se mají založit. */
function FileDialog({
  mail,
  projects,
  onClose,
}: {
  mail: MailView;
  projects: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(mail.projectId ?? projects[0]?.id ?? "");
  const [subProjectId, setSubProjectId] = useState(mail.subProjectId ?? "");
  const [picked, setPicked] = useState<string[]>(mail.requestIds ?? []);
  const [bundleName, setBundleName] = useState("");
  const [loaded, setLoaded] = useState<{ projectId: string; opts: ProjectOptions } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Složky a žádanky vybraného projektu. Výsledek se ukládá i s tím, pro který
  // projekt platí – tím se samo pozná načítání a starší odpověď nepřebije novou.
  useEffect(() => {
    if (!projectId) return;
    let platne = true;
    projectOptions(projectId)
      .then((o) => {
        if (!platne) return;
        setLoaded({ projectId, opts: o });
        // Návrh se udrží jen pro žádanky, které v projektu opravdu jsou.
        setPicked((cur) => cur.filter((id) => o.requests.some((r) => r.id === id)));
        setSubProjectId((cur) => (o.folders.some((f) => f.id === cur) ? cur : ""));
      })
      .catch(() => {
        if (platne) setErr("Složky a žádanky projektu se nepodařilo načíst.");
      });
    return () => {
      platne = false;
    };
  }, [projectId]);

  const opts: ProjectOptions = loaded?.projectId === projectId ? loaded.opts : PRAZDNE;
  const loading = !!projectId && loaded?.projectId !== projectId;

  // Ve složce se nabízejí jen její žádanky; bez složky všechny.
  const viditelne = subProjectId
    ? opts.requests.filter((r) => r.subProjectId === subProjectId)
    : opts.requests;
  const folderName = (id: string | null) => opts.folders.find((f) => f.id === id)?.name;

  const hint = loading
    ? "Načítám žádanky…"
    : !projectId
      ? "Nejdřív vyber projekt."
      : viditelne.length === 0
        ? subProjectId
          ? "V téhle složce nejsou otevřené žádanky – zkus celý projekt."
          : "Projekt nemá otevřené žádanky."
        : viditelne.length + " otevřených žádanek";

  return (
    <Dialog title="Zařadit do evidence" size="md" onClose={onClose}>
      <form
        action={async (fd) => {
          setBusy(true);
          setErr(null);
          try {
            await fileMail(fd);
            onClose();
            router.refresh();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Zařazení selhalo.");
          }
          setBusy(false);
        }}
        className="space-y-4 p-5"
      >
        <input type="hidden" name="mailId" value={mail.id} />

        <div className="border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
          <p className="font-medium text-stone-900">{mail.subject}</p>
          <p className="mt-0.5">
            od {mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress}
          </p>
          {mail.reason && <p className="mt-1 italic">Návrh: {mail.reason}</p>}
        </div>

        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="m-project">Projekt</Label>
            <select
              id="m-project"
              name="projectId"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={selectClass}
              required
            >
              <option value="">— vyber —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-folder">Složka</Label>
            <select
              id="m-folder"
              name="subProjectId"
              value={subProjectId}
              onChange={(e) => setSubProjectId(e.target.value)}
              className={selectClass}
              disabled={opts.folders.length === 0}
            >
              <option value="">— celý projekt —</option>
              {opts.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Žádanky, kterých se nabídka týká</Label>
          <ul className="max-h-56 overflow-y-auto border border-stone-200">
            {viditelne.map((r) => {
              const navrzena = (mail.requestIds ?? []).includes(r.id);
              return (
                <li key={r.id} className="border-b border-stone-100 last:border-b-0">
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-stone-900">
                    <input
                      type="checkbox"
                      name="requestIds"
                      value={r.id}
                      checked={picked.includes(r.id)}
                      onChange={(e) =>
                        setPicked((cur) => (e.target.checked ? [...cur, r.id] : cur.filter((x) => x !== r.id)))
                      }
                      className="size-4 shrink-0 cursor-pointer accent-stone-900"
                    />
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    {!subProjectId && r.subProjectId && (
                      <span className="shrink-0 text-[11px] text-stone-400">{folderName(r.subProjectId)}</span>
                    )}
                    {navrzena && (
                      <span className="shrink-0 border border-stone-300 px-1.5 text-[10px] uppercase tracking-wide text-stone-500">
                        návrh
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
            {viditelne.length === 0 && <li className="px-3 py-2 text-sm text-stone-500">{hint}</li>}
          </ul>
          {viditelne.length > 0 && <p className="text-xs text-stone-400">{hint}</p>}
        </div>

        {picked.length > 1 && (
          <div className="space-y-1.5 border border-stone-200 bg-stone-50 p-3">
            <Label htmlFor="m-bundle">Název balíčku</Label>
            <input
              id="m-bundle"
              name="bundleName"
              value={bundleName}
              onChange={(e) => setBundleName(e.target.value)}
              placeholder="Např. Výplně otvorů"
              className={selectClass}
            />
            <p className="text-xs text-stone-500">
              Vybrané žádanky ({picked.length}) se sdruží do poptávkového balíčku a příloha se založí jako
              společná nabídka – soubor bude jeden a uvidíš ho u všech. Ceny a dodavatele doplní zpracování.
              Když některá žádanka už v balíčku je, použije se ten.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Co založit</Label>
          <ul className="border border-stone-200">
            {mail.attachments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-3 py-2 last:border-b-0">
                <label className="flex min-w-0 flex-1 basis-40 cursor-pointer items-center gap-2 text-sm text-stone-900">
                  <input
                    type="checkbox"
                    name={`use_${a.id}`}
                    value="1"
                    defaultChecked
                    className="size-4 shrink-0 cursor-pointer accent-stone-900"
                  />
                  <span className="truncate" title={a.originalName}>
                    {a.originalName}
                  </span>
                  <span className="shrink-0 text-[11px] text-stone-400">{kb(a.size)}</span>
                </label>
                <select name={`kind_${a.id}`} defaultValue={a.kind} className="h-8 w-40 border border-stone-300 bg-white px-2 text-xs">
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
            {mail.attachments.length === 0 && (
              <li className="px-3 py-2 text-sm text-stone-500">E-mail nemá přílohy.</li>
            )}
          </ul>
          <p className="text-xs text-stone-400">
            Faktura půjde mezi doklady projektu, ostatní k vybrané žádance.
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" name="withEmail" value="1" defaultChecked className="size-4 cursor-pointer accent-stone-900" />
          Přiložit i samotný e-mail (jen když vybereš žádanku)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" name="extract" value="1" defaultChecked className="size-4 cursor-pointer accent-stone-900" />
          Rovnou zpracovat nabídky do návrhu
        </label>

        {err && <p className="text-xs text-red-600">{err}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button type="submit" disabled={busy || !projectId}>
            {busy ? "Zakládám…" : "Založit"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/**
 * Doručená pošta (#41): vstupní složka pro přeposlané nabídky a faktury.
 * Rozpoznání je jen návrh – projekt, žádanku i typ přílohy potvrzuje člověk.
 */
export function MailInbox({
  mails,
  projects,
  configured,
}: {
  mails: MailView[];
  projects: { id: string; name: string }[];
  configured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const active = mails.find((m) => m.id === open) ?? null;

  const fetchNow = () =>
    start(async () => {
      setMsg(null);
      try {
        const r = await runMailbox();
        setMsg(
          r.fetched === 0
            ? "Ve schránce nic nového."
            : `Staženo ${r.stored} z ${r.fetched}${r.skipped ? `, ${r.skipped} přeskočeno` : ""}.`,
        );
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Vybrání schránky selhalo.");
      }
    });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="kicker">{mails.length} ve vstupní složce</p>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs text-stone-500">{msg}</span>}
          {configured && (
            <button
              type="button"
              onClick={fetchNow}
              disabled={pending}
              title="Vybrat schránku teď (IMAP)"
              className="inline-flex cursor-pointer items-center gap-1.5 border border-stone-300 px-2.5 py-1.5 text-xs text-stone-700 hover:border-stone-950 disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
              {pending ? "Vybírám…" : "Vybrat poštu"}
            </button>
          )}
        </div>
      </div>

      {mails.length === 0 ? (
        <p className="border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
          Vstupní složka je prázdná. Přetáhni v Gmailu nabídku nebo fakturu pod štítek pojmenovaný
          jako projekt nebo složka – do pár minut bude tady.
        </p>
      ) : (
        <ul className="border-t border-stone-200">
          {mails.map((m) => (
            <li key={m.id} className="border-b border-stone-200 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="flex items-center gap-2 text-sm font-medium text-stone-950">
                    <Mail className="size-3.5 shrink-0 text-stone-400" />
                    <span className="truncate">{m.subject}</span>
                    {m.status === "zarazena" && (
                      <span className="shrink-0 border border-emerald-600 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700">
                        zařazeno
                      </span>
                    )}
                    {m.status === "odmitnuta" && (
                      <span className="shrink-0 border border-stone-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-500">
                        odmítnuto
                      </span>
                    )}
                  </p>
                  <p className="kicker mt-0.5">
                    {m.fromName ? `${m.fromName} · ` : ""}
                    {m.fromAddress} · {formatDate(new Date(m.receivedAt))}
                    {m.confidence != null ? ` · jistota ${Math.round(m.confidence)} %` : ""}
                  </p>
                  {m.reason && m.status === "nova" && (
                    <p className="mt-1 text-xs text-stone-600">Návrh: {m.reason}</p>
                  )}
                  {m.note && m.status !== "nova" && <p className="mt-1 text-xs text-stone-500">{m.note}</p>}
                  {m.attachments.length > 0 && (
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
                      {m.attachments.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1">
                          <Paperclip className="size-3" />
                          {a.documentId ? (
                            <a
                              href={`/api/documents/${a.documentId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline-offset-2 hover:text-stone-950 hover:underline"
                            >
                              {a.originalName}
                            </a>
                          ) : (
                            <span>{a.originalName}</span>
                          )}
                          <span className="text-stone-400">
                            {kindLabel(a.kind)} · {kb(a.size)}
                          </span>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {m.status === "nova" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setOpen(m.id)}
                        className="inline-flex cursor-pointer items-center gap-1 border border-stone-300 px-2 py-1 text-[11px] text-stone-700 hover:border-stone-950"
                      >
                        <Check className="size-3" />
                        Zařadit
                      </button>
                      <form action={dismissMail}>
                        <input type="hidden" name="mailId" value={m.id} />
                        <button
                          type="submit"
                          title="Odmítnout – do evidence nepatří"
                          className="cursor-pointer p-1 text-stone-400 hover:text-stone-950"
                        >
                          <X className="size-4" />
                        </button>
                      </form>
                    </>
                  )}
                  {m.status === "zarazena" && m.projectId && (
                    <a
                      href={`/projects/${m.projectId}?tab=${m.requestId ? "zadanky" : "vydaje"}`}
                      className="inline-flex items-center gap-1 border border-stone-300 px-2 py-1 text-[11px] text-stone-700 hover:border-stone-950"
                    >
                      <Download className="size-3" />
                      V projektu
                    </a>
                  )}
                  <DeleteButton action={deleteMail} fields={{ mailId: m.id }} confirm="Smazat zprávu i s nezařazenými přílohami?" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {active && <FileDialog mail={active} projects={projects} onClose={() => setOpen(null)} />}
    </>
  );
}
