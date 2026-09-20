import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { SettingsNav } from "@/components/account/settings-nav";
import { CodelistManager } from "@/components/account/codelist-manager";

/** Vlastní číselníky: typy, kategorie a stavy používané v projektech. */
export default async function CodelistSettingsPage() {
  await requireUser();
  const [projTypes, expCats, docTypes, reqStatuses, offerStatuses, expStatuses, taskStatuses] = await Promise.all([
    prisma.projectType.findMany({ orderBy: { label: "asc" }, select: { id: true, label: true } }),
    prisma.expenseCategory.findMany({ orderBy: { label: "asc" }, select: { id: true, label: true } }),
    prisma.documentType.findMany({ orderBy: { label: "asc" }, select: { id: true, label: true } }),
    prisma.statusOption.findMany({ where: { scope: "request" }, orderBy: [{ sort: "asc" }, { label: "asc" }], select: { id: true, label: true } }),
    prisma.statusOption.findMany({ where: { scope: "offer" }, orderBy: [{ sort: "asc" }, { label: "asc" }], select: { id: true, label: true } }),
    prisma.statusOption.findMany({ where: { scope: "expense" }, orderBy: [{ sort: "asc" }, { label: "asc" }], select: { id: true, label: true } }),
    prisma.statusOption.findMany({ where: { scope: "task" }, orderBy: [{ sort: "asc" }, { label: "asc" }], select: { id: true, label: true } }),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4">
        <h1 className="display text-4xl text-stone-950">Nastavení</h1>
      </header>
      <SettingsNav />
      <section className="mt-8">
        <p className="mb-5 max-w-lg text-sm text-stone-500">
          Přidej, přejmenuj nebo smaž vlastní typy, kategorie a stavy. Vestavěné jsou pevné a v seznamu se nezobrazují.
          Smazat lze jen položku, která se nikde nepoužívá.
        </p>
        <CodelistManager
          groups={[
            { kind: "projectType", title: "Typy projektů", items: projTypes },
            { kind: "expenseCategory", title: "Kategorie výdajů", items: expCats },
            { kind: "documentType", title: "Typy dokumentů", items: docTypes },
            { kind: "requestStatus", title: "Stavy žádanek", items: reqStatuses },
            { kind: "offerStatus", title: "Stavy nabídek", items: offerStatuses },
            { kind: "expenseStatus", title: "Stavy výdajů", items: expStatuses },
            { kind: "taskStatus", title: "Stavy úkolů", items: taskStatuses },
          ]}
        />
      </section>
    </div>
  );
}
