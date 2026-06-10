"use client";

import { useEffect, useState, useTransition } from "react";
import { setVendorRole, setVendorSubRole } from "@/server/actions/memberships";
import { PROJECT_ROLES } from "@/lib/constants";

export function VendorRoleSelect({
  projectId,
  vendorId,
  role,
  subProjectId,
}: {
  projectId: string;
  vendorId: string;
  role: string;
  subProjectId?: string;
}) {
  const [value, setValue] = useState(role);
  const [pending, start] = useTransition();

  // Po uložení a revalidaci se sem propíše skutečná role z DB.
  useEffect(() => {
    setValue(role);
  }, [role]);

  function onChange(next: string) {
    const prev = value;
    setValue(next); // optimisticky
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("vendorId", vendorId);
    fd.set("role", next);
    if (subProjectId) fd.set("subProjectId", subProjectId);
    start(async () => {
      try {
        if (subProjectId) await setVendorSubRole(fd);
        else await setVendorRole(fd);
      } catch {
        setValue(prev); // při chybě zpět
        window.alert("Změna role se nezdařila.");
      }
    });
  }

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 rounded-none border border-stone-300 bg-white px-1.5 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950 disabled:opacity-50"
    >
      {PROJECT_ROLES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}
