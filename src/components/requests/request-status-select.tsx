"use client";

import { setRequestStatus } from "@/server/actions/requests";

export function RequestStatusSelect({
  projectId,
  id,
  status,
  statuses,
}: {
  projectId: string;
  id: string;
  status: string;
  statuses: { key: string; label: string }[];
}) {
  return (
    <form action={setRequestStatus}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-7 rounded-none border border-stone-300 bg-white px-1.5 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950"
      >
        {statuses.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </form>
  );
}
