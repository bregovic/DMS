import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/ui/delete-button";
import { OperationForm } from "@/components/catalog/operation-form";
import { ParamAddForm } from "@/components/catalog/param-add-form";
import { RecipeForm } from "@/components/catalog/recipe-form";
import { OperationPreview } from "@/components/catalog/operation-preview";
import { deleteOperation, deleteParam, deleteRecipe } from "@/server/actions/process-tables";

export default async function OperationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();

  const [operation, materials] = await Promise.all([
    prisma.operation.findFirst({
      where: { id },
      include: {
        params: { orderBy: { sort: "asc" } },
        materials: {
          orderBy: { id: "asc" },
          include: { material: { select: { id: true, code: true, name: true, unit: true, unitPrice: true } } },
        },
      },
    }),
    prisma.material.findMany({
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, unit: true },
    }),
  ]);

  if (!operation) notFound();

  const calcOp = {
    id: operation.id,
    name: operation.name,
    unit: operation.unit,
    quantityFormula: operation.quantityFormula,
    laborFormula: operation.laborFormula,
    laborRate: operation.laborRate != null ? Number(operation.laborRate) : null,
    params: operation.params.map((p) => ({
      key: p.key,
      defaultValue: p.defaultValue != null ? Number(p.defaultValue) : null,
    })),
    materials: operation.materials.map((r) => ({
      materialId: r.material.id,
      name: r.material.name,
      unit: r.material.unit,
      unitPrice: Number(r.material.unitPrice),
      quantityFormula: r.quantityFormula,
      wastePct: r.wastePct != null ? Number(r.wastePct) : null,
    })),
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/katalog/ukony" className="kicker text-stone-400 hover:text-stone-950">
        ← Úkony
      </Link>
      <header className="mb-8 mt-2 flex items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <div>
          <h1 className="display text-3xl text-stone-950">{operation.name}</h1>
          <p className="mt-1 text-sm text-stone-500">
            <span className="font-mono text-stone-400">{operation.code}</span> · MJ{" "}
            {operation.unit} · množství <code>{operation.quantityFormula}</code> ·
            normohodiny <code>{operation.laborFormula}</code>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <OperationForm
            operation={{
              id: operation.id,
              code: operation.code,
              name: operation.name,
              unit: operation.unit,
              quantityFormula: operation.quantityFormula,
              laborFormula: operation.laborFormula,
              laborRate: operation.laborRate != null ? Number(operation.laborRate) : null,
              crew: operation.crew ?? 1,
              techPauseDays: operation.techPauseDays ?? null,
              description: operation.description,
              category: operation.category,
            }}
          />
          <DeleteButton
            action={deleteOperation}
            fields={{ id: operation.id }}
            confirm={`Smazat úkon „${operation.name}"?`}
          />
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Parametry */}
        <section className="space-y-4">
          <h2 className="kicker">Parametry</h2>
          {operation.params.length === 0 ? (
            <p className="text-sm text-stone-400">Zatím žádné parametry.</p>
          ) : (
            <ul className="divide-y divide-stone-100 border-y border-stone-200">
              {operation.params.map((p) => (
                <li key={p.id} className="group flex items-center justify-between py-2 text-sm">
                  <span>
                    <code className="text-stone-950">{p.key}</code>{" "}
                    <span className="text-stone-500">— {p.label}</span>
                    {p.unit ? <span className="text-stone-400"> ({p.unit})</span> : null}
                    {p.defaultValue != null ? (
                      <span className="text-stone-400"> · výchozí {Number(p.defaultValue)}</span>
                    ) : null}
                  </span>
                  <span className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <DeleteButton action={deleteParam} fields={{ id: p.id }} confirm={`Smazat parametr „${p.key}"?`} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ParamAddForm operationId={operation.id} />
        </section>

        {/* Recept */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="kicker">Recept (spotřeba materiálu)</h2>
            <RecipeForm operationId={operation.id} materials={materials} />
          </div>
          {operation.materials.length === 0 ? (
            <p className="text-sm text-stone-400">
              {materials.length === 0
                ? "Nejdřív přidej materiály v záložce Materiály."
                : "Zatím žádný materiál v receptu."}
            </p>
          ) : (
            <ul className="divide-y divide-stone-100 border-y border-stone-200">
              {operation.materials.map((r) => (
                <li key={r.id} className="group flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="text-stone-950">{r.material.name}</span>{" "}
                    <span className="text-stone-400">({r.material.unit})</span>
                    <span className="block text-stone-500">
                      <code>{r.quantityFormula}</code>
                      {r.wastePct != null ? ` · prořez ${Number(r.wastePct)} %` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <RecipeForm
                      operationId={operation.id}
                      materials={materials}
                      recipe={{
                        id: r.id,
                        materialId: r.material.id,
                        quantityFormula: r.quantityFormula,
                        wastePct: r.wastePct != null ? Number(r.wastePct) : null,
                        note: r.note,
                      }}
                    />
                    <DeleteButton action={deleteRecipe} fields={{ id: r.id }} confirm="Odebrat materiál z receptu?" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Náhled výpočtu */}
      <section className="mt-10 space-y-4 border-t border-stone-300/80 pt-6">
        <h2 className="kicker">Náhled výpočtu</h2>
        <OperationPreview
          operation={calcOp}
          params={operation.params.map((p) => ({
            key: p.key,
            label: p.label,
            unit: p.unit,
            defaultValue: p.defaultValue != null ? Number(p.defaultValue) : null,
          }))}
        />
      </section>
    </div>
  );
}
