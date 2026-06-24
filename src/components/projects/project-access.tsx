"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { setMemberRole, setSubMemberRole } from "@/server/actions/memberships";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Member = { email: string; role: string };
type Role = "member" | "active" | "reader" | "none";

const ROLE_OPTIONS: { value: Exclude<Role, "none">; label: string; hint: string }[] = [
  { value: "member", label: "Spolusprávce", hint: "vidí a edituje vše" },
  { value: "active", label: "Dodavatel", hint: "vidí jen své záznamy" },
  { value: "reader", label: "Jen čtení", hint: "vidí vše, needituje" },
];

function call(
  projectId: string,
  subProjectId: string | undefined,
  email: string,
  role: Role,
) {
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
}: {
  projectId: string;
  subProjectId?: string;
  email: string;
  role: string;
}) {
  const [pending, start] = useTransition();
  return (
    <li className="group flex items-center justify-between gap-2 border-b border-stone-200 py-2.5">
      <p className="min-w-0 flex-1 truncate text-sm text-stone-900">{email}</p>
      <select
        defaultValue={role}
        disabled={pending}
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
        className="h-8 border border-stone-300 bg-white px-1.5 text-xs text-stone-700"
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
        className="flex size-7 shrink-0 items-center justify-center text-stone-400 opacity-100 transition-all hover:bg-stone-950 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-50 cursor-pointer"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

export function ProjectAccess({
  projectId,
  subProjectId,
  members,
  canManage,
}: {
  projectId: string;
  subProjectId?: string;
  members: Member[];
  canManage: boolean;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "none">>("member");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function invite() {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@")) {
      setErr("Zadej platný e-mail.");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await call(projectId, subProjectId, e, role);
        setEmail("");
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : "Pozvání selhalo.");
      }
    });
  }

  return (
    <div>
      {canManage && (
        <p className="mb-3 text-xs text-stone-500">
          Zadej <span className="text-stone-800">e‑mail</span> a vyber roli. Přístup je
          {subProjectId ? " jen k této složce (a jejím pod-složkám)" : " k celému projektu"}.
          Přihlásí se tímto e‑mailem.{" "}
          <span className="text-stone-700">Spolusprávce</span> vidí i edituje vše;{" "}
          <span className="text-stone-700">dodavatel</span> jen své záznamy;{" "}
          <span className="text-stone-700">jen čtení</span> nic nemění.
        </p>
      )}

      {members.length === 0 ? (
        <p className="py-2 text-sm text-stone-500">Zatím nikdo nemá přístup.</p>
      ) : (
        <ul>
          {members.map((m) =>
            canManage ? (
              <MemberRow
                key={m.email}
                projectId={projectId}
                subProjectId={subProjectId}
                email={m.email}
                role={m.role}
              />
            ) : (
              <li
                key={m.email}
                className="border-b border-stone-200 py-2.5 text-sm text-stone-900"
              >
                {m.email}
              </li>
            ),
          )}
        </ul>
      )}

      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
            className="h-9 min-w-0 flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Exclude<Role, "none">)}
            className="h-9 border border-stone-300 bg-white px-2 text-sm text-stone-700"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} – {o.hint}
              </option>
            ))}
          </select>
          <Button size="sm" type="button" disabled={pending} onClick={invite}>
            <Plus className="size-4" />
            Přidat přístup
          </Button>
          {err && <span className="w-full text-xs text-red-600">{err}</span>}
        </div>
      )}
    </div>
  );
}
