"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { setMemberRole, setSubMemberRole } from "@/server/actions/memberships";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Member = { email: string; role: string };

const ROLE_OPTIONS = [
  { value: "active", label: "Aktivní dodavatel" },
  { value: "reader", label: "Reader" },
];
const roleLabel = (r: string) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;

const selectClass =
  "h-7 rounded-none border border-stone-300 bg-white px-1.5 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950 disabled:opacity-50";

function call(
  projectId: string,
  subProjectId: string | undefined,
  email: string,
  role: string,
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
  const [value, setValue] = useState(role);
  const [pending, start] = useTransition();

  function change(next: string) {
    const prev = value;
    setValue(next);
    start(async () => {
      try {
        await call(projectId, subProjectId, email, next);
      } catch {
        setValue(prev);
        window.alert("Změna se nezdařila.");
      }
    });
  }

  return (
    <li className="flex items-center justify-between gap-2 border-b border-stone-200 py-2.5">
      <p className="min-w-0 truncate text-sm text-stone-900">{email}</p>
      <div className="flex shrink-0 items-center gap-2">
        <select
          value={value}
          disabled={pending}
          onChange={(e) => change(e.target.value)}
          className={selectClass}
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
            if (window.confirm(`Odebrat přístup ${email}?`)) change("none");
          }}
          className="flex size-7 items-center justify-center text-stone-400 hover:bg-stone-950 hover:text-white disabled:opacity-50 cursor-pointer"
        >
          <X className="size-3.5" />
        </button>
      </div>
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
  const [role, setRole] = useState("active");
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
          Pozvi kohokoli zadáním <span className="text-stone-800">e‑mailu</span> a
          nastav roli: <span className="text-stone-800">Aktivní dodavatel</span>{" "}
          přidává záznamy, <span className="text-stone-800">Reader</span> jen čte.
          Přihlásí se tímto e‑mailem.
          {subProjectId
            ? " Přístup platí jen pro tuto složku (a její pod-složky)."
            : " Přístup platí pro celý projekt."}
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
                className="flex items-center justify-between gap-2 border-b border-stone-200 py-2.5 text-sm"
              >
                <span className="truncate text-stone-900">{m.email}</span>
                <span className="kicker">{roleLabel(m.role)}</span>
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
            placeholder="email@dodavatel.cz"
            className="h-9 min-w-0 flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-9 rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-700 focus-visible:outline-none focus-visible:border-stone-950"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button size="sm" type="button" disabled={pending} onClick={invite}>
            <Plus className="size-4" />
            Pozvat
          </Button>
          {err && <span className="w-full text-xs text-red-600">{err}</span>}
        </div>
      )}
    </div>
  );
}
