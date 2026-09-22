"use client";

import { useState } from "react";
import { Check, Paperclip, Pencil, Plus } from "lucide-react";
import {
  attachBundleOfferFile,
  deleteBundle,
  deleteBundleOffer,
  selectBundleOffer,
  setBundleOfferStatus,
  updateBundle,
} from "@/server/actions/bundles";
import { deleteDocument } from "@/server/actions/documents";
import { BundleOfferForm, type BundleOfferView } from "@/components/requests/bundle-offer-form";
import { OfferComparison, type ComparisonView } from "@/components/requests/offer-comparison";
import { DeleteButton } from "@/components/ui/delete-button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/utils";

/** Jedna buňka matice – shodné s BundleCell na serveru. */
type Cell = { price: number | null; covered: boolean; source: "bundle" | "single" | null };

export type BundleView = {
  id: string;
  name: string;
  note: string | null;
  status: string;
  requests: { id: string; title: string }[];
  vendors: {
    key: string;
    name: string;
    bundlePrice: number | null;
    bundleOfferId: string | null;
    total: number | null;
    cells: Record<string, Cell>;
    covered: number;
    full: boolean;
    selected: boolean;
  }[];
  bestSingle: { key: string; name: string; total: number } | null;
  bestCombo: { total: number; picks: { requestId: string; vendorName: string; price: number }[] } | null;
  comboSaving: number | null;
  offers: BundleOfferView[];
  comparison: ComparisonView;
};

const statusOptions = [
  { key: "nova", label: "Nová" },
  { key: "vyhovuje", label: "Vyhovuje" },
  { key: "odmitnuta", label: "Odmítnutá" },
  { key: "vybrana", label: "Vybraná" },
];

function EditBundle({ bundle, onClose }: { bundle: BundleView; onClose: () => void }) {
  return (
    <Dialog title="Upravit balíček" size="md" onClose={onClose}>
      <form
        action={async (fd) => {
          await updateBundle(fd);
          onClose();
        }}
        className="space-y-4 p-5"
      >
        <input type="hidden" name="id" value={bundle.id} />
        <div className="space-y-1.5">
          <Label htmlFor="b-name">Název</Label>
          <Input id="b-name" name="name" defaultValue={bundle.name} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-note">Poznámka</Label>
          <Input id="b-note" name="note" defaultValue={bundle.note ?? ""} placeholder="Např. jeden dodavatel na celé výplně" />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button type="submit">Uložit</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/** Buňka matice: cena, „v ceně balíčku“, nebo prázdno = nenabídla. */
function MatrixCell({ cell }: { cell: Cell | undefined }) {
  if (!cell?.covered) return <span className="text-stone-300">—</span>;
  if (cell.price != null) return <span className="font-mono text-stone-950">{formatCurrency(cell.price)}</span>;
  return <span className="text-[11px] text-stone-500">{cell.source === "bundle" ? "v ceně balíčku" : "bez ceny"}</span>;
}

/**
 * Poptávkový balíček (#40): matice firem × žádanek, společné nabídky a
 * porovnání za celek. Firma, která poslala jednu sumu na všechno, stojí
 * v matici vedle firem se samostatnými nabídkami a je vidět, co kdo kryje.
 */
export function BundlePanel({
  bundle,
  projectId,
  vendors,
  isManager,
  canAdd,
}: {
  bundle: BundleView;
  projectId: string;
  vendors: { id: string; label: string }[];
  isManager: boolean;
  canAdd: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const reqs = bundle.requests;
  const offerCount = bundle.vendors.length;

  return (
    <section className="mb-6 border border-stone-300 bg-stone-50/60">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-stone-200 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-stone-950">
            {bundle.name}
            {bundle.status === "vybrano" && (
              <span className="ml-2 border border-emerald-600 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700">
                vybráno
              </span>
            )}
          </h3>
          <p className="kicker mt-0.5">
            Balíček · {reqs.length} {reqs.length === 1 ? "žádanka" : reqs.length < 5 ? "žádanky" : "žádanek"}
            {` · ${reqs.map((r) => r.title).join(" · ")}`}
          </p>
          {bundle.note && <p className="mt-1 text-xs text-stone-600">{bundle.note}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canAdd && (
            <BundleOfferForm
              mode="create"
              bundleId={bundle.id}
              requests={reqs}
              vendors={vendors}
              trigger={(open) => (
                <button
                  type="button"
                  onClick={open}
                  className="inline-flex cursor-pointer items-center gap-1 border border-stone-300 bg-white px-2 py-1 text-[11px] text-stone-700 hover:border-stone-950"
                >
                  <Plus className="size-3.5" />
                  Společná nabídka
                </button>
              )}
            />
          )}
          {isManager && (
            <>
              <button
                type="button"
                onClick={() => setEdit(true)}
                title="Upravit balíček"
                className="cursor-pointer p-1 text-stone-400 hover:text-stone-950"
              >
                <Pencil className="size-3.5" />
              </button>
              <DeleteButton
                action={deleteBundle}
                fields={{ id: bundle.id, projectId }}
                confirm="Rozpustit balíček? Žádanky zůstanou, společné nabídky se smažou."
              />
            </>
          )}
        </div>
      </header>

      <div className="px-4 py-3">
        {offerCount === 0 ? (
          <p className="text-sm text-stone-500">
Zatím žádná nabídka.
          </p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500">
                  <th className="py-1.5 pr-3 font-medium">Firma</th>
                  {reqs.map((r) => (
                    <th key={r.id} className="py-1.5 pr-3 text-right font-medium">
                      {r.title}
                    </th>
                  ))}
                  <th className="py-1.5 pr-3 text-right font-medium">Celkem</th>
                </tr>
              </thead>
              <tbody>
                {bundle.vendors.map((v) => (
                  <tr key={v.key} className={`border-b border-stone-100 ${v.selected ? "bg-emerald-50/70" : ""}`}>
                    <td className="py-1.5 pr-3 font-medium text-stone-950">
                      {v.name}
                      {!v.full && (
                        <span className="ml-1.5 text-[10px] text-orange-700">
                          kryje {v.covered}/{reqs.length}
                        </span>
                      )}
                      {v.bundlePrice != null && <span className="ml-1.5 text-[10px] text-stone-400">společná</span>}
                    </td>
                    {reqs.map((r) => (
                      <td key={r.id} className="py-1.5 pr-3 text-right">
                        <MatrixCell cell={v.cells[r.id]} />
                      </td>
                    ))}
                    <td className="py-1.5 pr-3 text-right font-mono text-stone-950">
                      {v.total != null ? formatCurrency(v.total) : <span className="text-stone-400">?</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(bundle.bestSingle || bundle.bestCombo) && (
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div className="border border-stone-200 bg-white p-2">
              <p className="kicker">Nejlevnější jedna firma</p>
              {bundle.bestSingle ? (
                <p className="mt-0.5 text-stone-900">
                  {bundle.bestSingle.name} ·{" "}
                  <span className="font-mono text-stone-950">{formatCurrency(bundle.bestSingle.total)}</span>
                </p>
              ) : (
                <p className="mt-0.5 text-stone-500">Celý balíček zatím nepokrývá žádná firma.</p>
              )}
            </div>
            <div className="border border-stone-200 bg-white p-2">
              <p className="kicker">Nejlevnější kombinace</p>
              {bundle.bestCombo ? (
                <>
                  <p className="mt-0.5 text-stone-900">
                    <span className="font-mono text-stone-950">{formatCurrency(bundle.bestCombo.total)}</span>
                    {bundle.comboSaving != null && bundle.comboSaving !== 0 && (
                      <span className={bundle.comboSaving > 0 ? " text-emerald-700" : " text-stone-500"}>
                        {bundle.comboSaving > 0
                          ? ` · o ${formatCurrency(bundle.comboSaving)} levnější`
                          : ` · o ${formatCurrency(-bundle.comboSaving)} dražší než jedna firma`}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-stone-500">
                    {bundle.bestCombo.picks
                      .map((p) => `${reqs.find((r) => r.id === p.requestId)?.title ?? "?"}: ${p.vendorName}`)
                      .join(" · ")}
                  </p>
                </>
              ) : (
                <p className="mt-0.5 text-stone-500">U některé žádanky zatím chybí rozepsaná cena.</p>
              )}
            </div>
          </div>
        )}

        {bundle.offers.length > 0 && (
          <ul className="mt-3 border-t border-stone-200">
            {bundle.offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-100 py-2 text-sm">
                <span className="min-w-0 flex-1 basis-40 truncate text-stone-900">
                  {o.vendorLabel}
                  <span className="text-xs text-stone-400">
                    {` · kryje ${o.parts.length} z ${reqs.length}`}
                    {o.deliveryDate ? ` · dodání ${formatDate(new Date(o.deliveryDate))}` : ""}
                  </span>
                </span>
                <span className="font-mono text-stone-950">
                  {o.price != null ? formatCurrency(o.price) : <span className="text-stone-400">bez ceny</span>}
                </span>
                {o.canEdit ? (
                  <form action={setBundleOfferStatus}>
                    <input type="hidden" name="id" value={o.id} />
                    <select
                      name="status"
                      defaultValue={o.status}
                      onChange={(e) => e.currentTarget.form?.requestSubmit()}
                      className="h-7 rounded-none border border-stone-300 bg-white px-1.5 text-xs text-stone-700 focus-visible:border-stone-950 focus-visible:outline-none"
                    >
                      {statusOptions.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </form>
                ) : (
                  <span className="border border-stone-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-500">
                    {statusOptions.find((s) => s.key === o.status)?.label ?? o.status}
                  </span>
                )}
                {isManager && (
                  <form action={selectBundleOffer}>
                    <input type="hidden" name="id" value={o.id} />
                    <button
                      type="submit"
                      title={o.selected ? "Zrušit výběr" : "Vybrat tuto nabídku pro celý balíček"}
                      className={`inline-flex cursor-pointer items-center gap-1 border px-2 py-1 text-[11px] ${
                        o.selected
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-stone-300 text-stone-600 hover:border-stone-950"
                      }`}
                    >
                      <Check className="size-3" />
                      {o.selected ? "Vybraná" : "Vybrat"}
                    </button>
                  </form>
                )}
                {o.canEdit && (
                  <>
                    <BundleOfferForm
                      mode="edit"
                      offer={o}
                      requests={reqs}
                      vendors={vendors}
                      trigger={(open) => (
                        <button
                          type="button"
                          onClick={open}
                          title="Upravit nabídku"
                          className="cursor-pointer p-1 text-stone-400 hover:text-stone-950"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                    />
                    <DeleteButton action={deleteBundleOffer} fields={{ id: o.id }} confirm="Smazat tuto společnou nabídku?" />
                  </>
                )}
                {(o.docs.length > 0 || o.canEdit) && (
                  <span className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-[11px]">
                    {o.docs.map((d) => (
                      <span key={d.id} className="inline-flex items-center gap-1 text-stone-500">
                        <Paperclip className="size-3" />
                        <a
                          href={`/api/documents/${d.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:text-stone-950 hover:underline"
                        >
                          {d.originalName}
                        </a>
                        {o.canEdit && <DeleteButton action={deleteDocument} fields={{ id: d.id }} confirm="Smazat přílohu?" />}
                      </span>
                    ))}
                    {o.canEdit && (
                      <form action={attachBundleOfferFile}>
                        <input type="hidden" name="id" value={o.id} />
                        <label className="inline-flex cursor-pointer items-center gap-1 text-stone-400 underline-offset-2 hover:text-stone-950 hover:underline">
                          <Plus className="size-3" />
                          příloha
                          <input
                            type="file"
                            name="file"
                            accept="image/*,application/pdf,.eml,.msg"
                            className="hidden"
                            onChange={(e) => e.currentTarget.form?.requestSubmit()}
                          />
                        </label>
                      </form>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <OfferComparison
          bundleId={bundle.id}
          offerCount={offerCount}
          canRun={isManager}
          comparison={bundle.comparison}
        />
      </div>

      {edit && <EditBundle bundle={bundle} onClose={() => setEdit(false)} />}
    </section>
  );
}
