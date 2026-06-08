import { X } from "lucide-react";
import {
  addVendorToProject,
  removeVendorFromProject,
} from "@/server/actions/projects";
import { Button } from "@/components/ui/button";

type VendorLite = { id: string; name: string; email: string };

export function ProjectVendors({
  projectId,
  assigned,
  available,
}: {
  projectId: string;
  assigned: VendorLite[];
  available: VendorLite[];
}) {
  return (
    <div>
      {assigned.length === 0 ? (
        <p className="py-2 text-sm text-stone-500">
          Zatím nikdo není přiřazen.
        </p>
      ) : (
        <ul>
          {assigned.map((v) => (
            <li
              key={v.id}
              className="group flex items-center justify-between gap-2 border-b border-stone-200 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-950">
                  {v.name}
                </p>
                <p className="kicker mt-0.5 truncate">{v.email}</p>
              </div>
              <form action={removeVendorFromProject}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="vendorId" value={v.id} />
                <button
                  type="submit"
                  title="Odebrat z projektu"
                  className="flex size-7 items-center justify-center text-stone-400 opacity-0 transition-all hover:bg-stone-950 hover:text-white group-hover:opacity-100 cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <form action={addVendorToProject} className="mt-3 flex gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <select
            name="vendorId"
            defaultValue={available[0]?.id}
            className="flex h-9 min-w-0 flex-1 rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950"
          >
            {available.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <Button size="sm" type="submit">
            Přiřadit
          </Button>
        </form>
      )}
    </div>
  );
}
