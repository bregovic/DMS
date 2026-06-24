import Link from "next/link";
import { X } from "lucide-react";
import {
  addVendorToProject,
  removeVendorFromProject,
} from "@/server/actions/projects";
import { Button } from "@/components/ui/button";
import { VendorRoleSelect } from "@/components/projects/vendor-role-select";
import { roleLabel } from "@/lib/constants";

type VendorLite = { id: string; name: string; email: string };

export function ProjectVendors({
  projectId,
  assigned,
  available,
  rolesByVendor,
  canManage,
  subProjectId,
}: {
  projectId: string;
  assigned: VendorLite[];
  available: VendorLite[];
  rolesByVendor: Record<string, string>;
  canManage: boolean;
  subProjectId?: string;
}) {
  const scoped = Boolean(subProjectId);
  return (
    <div>
      {canManage && (
        <p className="mb-3 text-xs text-stone-500">
          {scoped ? (
            <>
              Nastav roli dodavateli <span className="text-stone-800">jen pro tuto
              složku</span> (a její pod-složky):{" "}
              <span className="text-stone-800">Aktivní dodavatel</span> přidává
              záznamy, <span className="text-stone-800">Reader</span> jen čte.
              Nabízí se dodavatelé přiřazení k projektu.
            </>
          ) : (
            <>
              Přiřaď dodavatele z evidence a nastav roli:{" "}
              <span className="text-stone-800">Aktivní dodavatel</span> se přihlásí
              (e‑mailem) a může přidávat záznamy,{" "}
              <span className="text-stone-800">Reader</span> jen čte. Přístup platí
              pro celý projekt včetně subprojektů.
            </>
          )}
        </p>
      )}
      {assigned.length === 0 ? (
        <p className="py-2 text-sm text-stone-500">Zatím nikdo není přiřazen.</p>
      ) : (
        <ul>
          {assigned.map((v) => {
            const role = rolesByVendor[v.id] ?? "vendor";
            return (
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
                <div className="flex shrink-0 items-center gap-2">
                  {canManage ? (
                    <VendorRoleSelect
                      projectId={projectId}
                      vendorId={v.id}
                      role={role}
                      subProjectId={subProjectId}
                    />
                  ) : (
                    role !== "vendor" && (
                      <span className="border border-stone-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-500">
                        {roleLabel(role)}
                      </span>
                    )
                  )}
                  {canManage && !scoped && (
                    <form action={removeVendorFromProject}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="vendorId" value={v.id} />
                      <button
                        type="submit"
                        title="Odebrat z projektu"
                        className="flex size-7 items-center justify-center text-stone-400 opacity-100 transition-all hover:bg-stone-950 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
                      >
                        <X className="size-3.5" />
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canManage && !scoped && available.length > 0 && (
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

      {canManage && !scoped && available.length === 0 && (
        <p className="mt-3 text-xs text-stone-500">
          Žádný další dodavatel k přiřazení.{" "}
          <Link
            href="/vendors"
            className="text-stone-950 underline underline-offset-4"
          >
            Přidej dodavatele v evidenci
          </Link>{" "}
          a pak ho tu přiřadíš.
        </p>
      )}
    </div>
  );
}
