"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { setMemberRole, setSubMemberRole } from "@/server/actions/memberships";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Member = { email: string; role: string };

// Přidání e-mailu = přístup (účast). Bez výběru role.
function call(
  projectId: string,
  subProjectId: string | undefined,
  email: string,
  role: "active" | "none",
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
}: {
  projectId: string;
  subProjectId?: string;
  email: string;
}) {
  const [pending, start] = useTransition();
  return (
    <li className="group flex items-center justify-between gap-2 border-b border-stone-200 py-2.5">
      <p className="min-w-0 truncate text-sm text-stone-900">{email}</p>
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
        className="flex size-7 shrink-0 items-center justify-center text-stone-400 opacity-0 transition-all hover:bg-stone-950 hover:text-white group-hover:opacity-100 disabled:opacity-50 cursor-pointer"
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
        await call(projectId, subProjectId, e, "active");
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
          Zadej <span className="text-stone-800">e‑mail</span> a získá přístup
          {subProjectId
            ? " jen k této složce (a jejím pod-složkám)"
            : " k celému projektu"}
          : může přidávat záznamy a vidí jen své. Přihlásí se tímto e‑mailem.
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
            placeholder="email@dodavatel.cz"
            className="h-9 min-w-0 flex-1"
          />
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
