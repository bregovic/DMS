import { Mail, Phone } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/ui/delete-button";
import { NewVendorForm } from "@/components/vendors/new-vendor-form";
import { deleteVendor } from "@/server/actions/vendors";
import { vendorCategoryLabel } from "@/lib/constants";

export default async function VendorsPage() {
  const user = await requireUser();

  const vendors = await prisma.vendor.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <h1 className="display text-4xl text-stone-950">Dodavatelé</h1>
        <NewVendorForm />
      </header>

      {vendors.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">
          Zatím tu nejsou žádní dodavatelé. Přidej prvního tlačítkem výše.
        </p>
      ) : (
        <ul className="border-t border-stone-300/80">
          {vendors.map((v) => (
            <li
              key={v.id}
              className="group flex items-start justify-between gap-4 border-b border-stone-200 py-4"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-3">
                  <p className="font-medium text-stone-950">{v.name}</p>
                  <span className="kicker">{vendorCategoryLabel(v.category)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-stone-500">
                  <a
                    href={`mailto:${v.email}`}
                    className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-stone-950 hover:underline"
                  >
                    <Mail className="size-3.5" />
                    {v.email}
                  </a>
                  {v.phone && (
                    <a
                      href={`tel:${v.phone}`}
                      className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-stone-950 hover:underline"
                    >
                      <Phone className="size-3.5" />
                      {v.phone}
                    </a>
                  )}
                </div>
                {v.description && (
                  <p className="mt-2 max-w-xl text-sm text-stone-500">
                    {v.description}
                  </p>
                )}
              </div>
              <span className="opacity-0 transition-opacity group-hover:opacity-100">
                <DeleteButton
                  action={deleteVendor}
                  fields={{ id: v.id }}
                  confirm={`Smazat dodavatele „${v.name}"?`}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
