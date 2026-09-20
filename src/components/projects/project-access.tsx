"use client";

import { useState, useTransition } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import { setMemberRole, setMemberScan, setSubMemberRole } from "@/server/actions/memberships";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Member = { email: string; role: string; canScan?: boolean };
type Role = "member" | "active" | "reader" | "none";

const ROLE_OPTIONS: { value: Exclude<Role, "none">; label: string; hint: string }[] = [
  { value: "member", label: "Spolusprávce", hint: "vidí a edituje vše" },
  { value: "active", label: "Dodavatel", hint: "vidí jen své záznamy" },
  { value: "reader", label: "Jen čtení", hint: "vidí vše, needituje" },
];

function call(projectId: string, subProjectId: string | undefined, email: string, role: Role) {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("role", role);
  if (subProjectId) {
    fd.set("subProjectId", subProjectId);
    return setSubMemberRole(fd);
  }
  fd.set("projectId", projectId);
  return setMemberRole(fd);
}

function MemberRow({
  projectId,
  subProjectId,
  email,
  role,
  canScan,
  showScan,
}: {
  projectId: string;
  subProjectId?: string;
  email: string;
  role: string;
  canScan: boolean;
  showScan: boolean;
}) {
  const [pending, start] = useTransition();
  const [scan, setScan] = useState(canScan);
  return (
    <li className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1 border-b border-stone-200 py-2.5">
      <p className="min-w-0 truncate text-sm text-stone-900" title={email}>
        {email}
      </p>
      <select
        defaultValue={role}
        disabled={pending}
        aria-label={`Role ${email}`}
        className="h-8 w-36 border border-stone-300 bg-white px-1.5 text-xs text-stone-700"
        onChange={(e) => {
          const next = e.target.value as Role;
          start(async () => {
            try {
              await call(projectId, subProjectId, email, next);
            } catch {
              window.alert("Změna role se nezdařila.");
            }
          });
        }}
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        title="Odebrat přístup"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Odebrat přístup ${email}?`)) return;
          start(async () => {
            try {
              await call(projectId, subProjectId, email, "none");
            } catch {
              window.alert("Odebrání se nezdařilo.");
            }
          });
        }}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center text-stone-400 transition-colors hover:bg-stone-950 hover:text-white disabled:opacity-50"
      >
        <X className="size-3.5" />
      </button>
      {showScan && (
        <label
          className="col-span-3 flex w-fit cursor-pointer items-center gap-1.5 text-[11px] text-stone-500"
          title="Doklady, které pošle, se rovnou přečtou – zpracování jde z tvého rozpočtu."
        >
          <input
            type="checkbox"
            checked={scan}
            disabled={pending}
            className="size-3.5 accent-stone-900"
            onChange={(e) => {
              const allow = e.target.checked;
              setScan(allow);
              start(async () => {
                try {
                  const fd = new FormData();
                  fd.set("projectId", projectId);
                  fd.set("email", email);
                  fd.set("allow", allow ? "1" : "0");
                  await setMemberScan(fd);
                } catch {
                  setScan(!allow);
                  window.alert("Nastavení se nezdařilo.");
                }
              });
            }}
          />
          <Sparkles className="size-3" />
          smí nechat doklady rovnou přečíst (na můj účet)
        </label>
      )}
    </li>
  );
}

/**
 * Kdo má k projektu (nebo složce) přístup. Nahoře se přidává, dole je seznam
 * lidí s rolí. U projektu jde navíc povolit, aby se doklady od toho člověka
 * rovnou vytěžovaly – jinak se jen uloží a zpracuje je vlastník.
 */
export function ProjectAccess({
  projectId,
  subProjectId,
  members,
  canManage,
  vendors = [],
}: {
  projectId: string;
  subProjectId?: string;
  members: Member[];
  canManage: boolean;
  /** Dodavatelé z evidence – přidají se jedním klikem podle e-mailu. */
  vendors?: { id: string; name: string; email: string }[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "none">>("member");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const known = new Set(members.map((m) => m.email.toLowerCase()));
  const freeVendors = vendors.filter((v) => v.email && !known.has(v.email.toLowerCase()));

  function invite(value?: string, asRole?: Exclude<Role, "none">) {
    const e = (value ?? email).trim().toLowerCase();
    if (!e || !e.includes("@")) {
      setErr("Zadej platný e-mail.");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await call(projectId, subProjectId, e, asRole ?? role);
        if (!value) setEmail("");
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : "Přidání selhalo.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <section className="space-y-2">
          <h3 className="kicker">Přidat přístup</h3>
          <div className="grid gap-2 sm:grid-cols-[1fr_13rem_auto]">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  invite();
                }
              }}
              placeholder="email@spolupracovnik.cz"
              aria-label="E-mail spolupracovníka"
              className="h-9 min-w-0"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Exclude<Role, "none">)}
              aria-label="Role"
              className="h-9 w-full border border-stone-300 bg-white px-2 text-sm text-stone-700"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button size="sm" type="button" disabled={pending} onClick={() => invite()} className="h-9 w-full sm:w-auto">
              <Plus className="size-4" />
              Přidat
            </Button>
          </div>
          <p className="text-xs text-stone-500">
            {ROLE_OPTIONS.find((o) => o.value === role)?.label} – {ROLE_OPTIONS.find((o) => o.value === role)?.hint}.
            Přístup je{subProjectId ? " jen k této složce a jejím pod-složkám" : " k celému projektu"}; přihlásí se
            tímhle e‑mailem.
          </p>
          {err && <p className="text-xs text-red-600">{err}</p>}

          {freeVendors.length > 0 && (
            <div className="pt-1">
              <p className="mb-1.5 text-[11px] text-stone-400">Z evidence dodavatelů – přidá se jako dodavatel:</p>
              <ul className="flex flex-wrap gap-1.5">
                {freeVendors.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      disabled={pending}
                      title={`Přidat ${v.email}`}
                      onClick={() => invite(v.email, "active")}
                      className="cursor-pointer border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 transition-colors hover:border-stone-950 disabled:opacity-50"
                    >
                      + {v.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section>
        <h3 className="kicker mb-1">Kdo má přístup · {members.length}</h3>
        {members.length === 0 ? (
          <p className="py-2 text-sm text-stone-500">Zatím nikdo další. Vlastník projektu vidí všechno vždy.</p>
        ) : (
          <ul className="border-t border-stone-200">
            {members.map((m) =>
              canManage ? (
                <MemberRow
                  key={m.email}
                  projectId={projectId}
                  subProjectId={subProjectId}
                  email={m.email}
                  role={m.role}
                  canScan={!!m.canScan}
                  showScan={!subProjectId && m.role !== "reader"}
                />
              ) : (
                <li key={m.email} className="border-b border-stone-200 py-2.5 text-sm text-stone-900">
                  {m.email}
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
