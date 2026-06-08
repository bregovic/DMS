"use client";

import { setVendorRole } from "@/server/actions/memberships";
import { PROJECT_ROLES } from "@/lib/constants";

export function VendorRoleSelect({
  projectId,
  vendorId,
  role,
}: {
  projectId: string;
  vendorId: string;
  role: string;
}) {
  return (
    <form action={setVendorRole}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="vendorId" value={vendorId} />
      <select
        name="role"
        defaultValue={role}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-7 rounded-none border border-stone-300 bg-white px-1.5 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950"
      >
        {PROJECT_ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </form>
  );
}
