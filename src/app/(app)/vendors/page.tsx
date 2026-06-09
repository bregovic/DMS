import { Mail, Phone } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/ui/delete-button";
import { NewVendorForm } from "@/components/vendors/new-vendor-form";
import { EditVendorForm } from "@/components/vendors/edit-vendor-form";
import { deleteVendor } from "@/server/actions/vendors";
import { vendorCategoryLabel } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

export default async function VendorsPage() {
  const user = await requireUser();

  const [vendors, totals] = await Promise.all([
    prisma.vendor.findMany({
      where: { ownerId: user.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { expenses: true, projects: true } } },
    }),
    prisma.expense.groupBy({
      by: ["vendorId"],
      where: { vendor: { ownerId: user.id } },
      _sum: { amount: true },
    }),
  ]);

  const totalByVendor = new Map(
    totals.map((t) => [t.vendorId, Number(t._sum.amount ?? 0)]),
  );

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
          {vendors.map((v) => {
            const spent = totalByVendor.get(v.id) ?? 0;
            return (
              <li
                key={v.id}
                className="group flex items-start justify-between gap-4 border-b border-stone-200 py-4"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3">
                    <p className="font-medium text-stone-950">{v.name}</p>
                    <span className="kicker">
                      {vendorCategoryLabel(v.category)}
                    </span>
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
                    {v.ico && <span>IČO {v.ico}</span>}
                    {v.dic && <span>{v.dic}</span>}
                  </div>
                  {v.address && (
                    <p className="mt-1 text-sm text-stone-400">{v.address}</p>
                  )}
                  {v.description && (
                    <p className="mt-2 max-w-xl text-sm text-stone-500">
                      {v.description}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-start gap-4 text-right">
                  <div>
                    <p className="font-mono text-sm text-stone-950">
                      {formatCurrency(spent)}
                    </p>
                    <p className="kicker mt-0.5">
                      {v._count.expenses} výdajů · {v._count.projects} proj.
                    </p>
                  </div>
                  <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <EditVendorForm
                      vendor={{
                        id: v.id,
                        name: v.name,
                        email: v.email,
                        category: v.category,
                        phone: v.phone,
                        description: v.description,
                        ico: v.ico,
                        dic: v.dic,
                        address: v.address,
                        bankAccount: v.bankAccount,
                        hourlyRate: v.hourlyRate != null ? Number(v.hourlyRate) : null,
                      }}
                    />
                    <DeleteButton
                      action={deleteVendor}
                      fields={{ id: v.id }}
                      confirm={`Smazat dodavatele „${v.name}"?`}
                    />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
