"use client";

import { useRef, useState } from "react";
import { Check, Paperclip, Pencil, Plus, X } from "lucide-react";
import {
  createOffer,
  updateOffer,
  deleteOffer,
  setOfferStatus,
  selectOffer,
  attachOfferFile,
} from "@/server/actions/offers";
import { deleteDocument } from "@/server/actions/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { DeleteButton } from "@/components/ui/delete-button";
import { formatCurrency, formatDate } from "@/lib/utils";

export type OfferView = {
  id: string;
  vendorId: string | null;
  vendorName: string | null;
  vendorLabel: string;
  price: number | null;
  deliveryDate: string | null; // yyyy-mm-dd
  note: string | null;
  rating: string | null;
  score: number | null;
  status: string;
  selected: boolean;
  canEdit: boolean;
  docs: { id: string; originalName: string }[];
};

type Vendor = { id: string; label: string };
type StatusOpt = { key: string; label: string };

const fieldClass =
  "flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950";

function OfferForm({
  mode,
  requestId,
  offer,
  vendors,
  trigger,
}: {
  mode: "create" | "edit";
  requestId?: string;
  offer?: OfferView;
  vendors: Vendor[];
  trigger: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) return <>{trigger(() => setOpen(true))}</>;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-0 py-0 sm:p-4 sm:py-12">
      <div className="w-full max-w-md border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">{mode === "create" ? "Nová nabídka" : "Upravit nabídku"}</h3>
          <button type="button" onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-950 cursor-pointer">
            <X className="size-4" />
          </button>
        </div>
        <form
          ref={formRef}
          action={async (fd) => {
            if (mode === "create") await createOffer(fd);
            else await updateOffer(fd);
            setOpen(false);
          }}
          className="space-y-4 p-5"
        >
          {mode === "create" ? (
            <input type="hidden" name="requestId" value={requestId} />
          ) : (
            <input type="hidden" name="id" value={offer!.id} />
          )}

          <div className="space-y-1.5">
            <Label>Dodavatel (z evidence)</Label>
            <Combobox
              name="vendorId"
              items={vendors}
              defaultId={offer?.vendorId ?? undefined}
              placeholder="Hledat dodavatele…"
              emptyLabel="— mimo evidenci —"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vendorName">…nebo jméno mimo evidenci</Label>
            <Input id="vendorName" name="vendorName" defaultValue={offer?.vendorName ?? ""} placeholder="Např. Truhlář Karel" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="price">Cena</Label>
              <Input id="price" name="price" type="number" step="0.01" min="0" defaultValue={offer?.price ?? ""} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deliveryDate">Termín dodání</Label>
              <Input id="deliveryDate" name="deliveryDate" type="date" defaultValue={offer?.deliveryDate ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="score">Body (0–100)</Label>
              <Input id="score" name="score" type="number" step="1" min="0" max="100" defaultValue={offer?.score ?? ""} placeholder="—" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rating">Hodnocení dodavatele</Label>
              <Input id="rating" name="rating" defaultValue={offer?.rating ?? ""} placeholder="Např. 4,5★ / reference" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Komentář k nabídce</Label>
            <textarea
              id="note"
              name="note"
              rows={2}
              defaultValue={offer?.note ?? ""}
              placeholder="Podmínky, co je v ceně, posouzení…"
              className={fieldClass}
            />
          </div>

          <p className="text-xs text-stone-400">
            Dodavatele lze vybrat z evidence, nebo napsat jméno mimo evidenci. Cenu,
            termín, body i komentář můžeš doplnit i později.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit">Uložit</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OfferStatusSelect({ id, status, statuses }: { id: string; status: string; statuses: StatusOpt[] }) {
  return (
    <form action={setOfferStatus}>
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

export function OffersPanel({
  requestId,
  offers,
  vendors,
  statuses,
  isOwner,
  canAdd,
}: {
  requestId: string;
  offers: OfferView[];
  vendors: Vendor[];
  statuses: StatusOpt[];
  isOwner: boolean;
  canAdd: boolean;
}) {
  const statusLabel = (k: string) => statuses.find((s) => s.key === k)?.label ?? k;

  return (
    <div className="mt-2 border-l-2 border-stone-200 pl-4">
      <div className="mb-1 flex items-center justify-between">
        <p className="kicker">Nabídky · {offers.length}</p>
        {canAdd && (
          <OfferForm
            mode="create"
            requestId={requestId}
            vendors={vendors}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className="inline-flex items-center gap-1 text-xs text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline cursor-pointer"
              >
                <Plus className="size-3.5" />
                Přidat nabídku
              </button>
            )}
          />
        )}
      </div>

      {offers.length === 0 ? (
        <p className="py-1 text-xs text-stone-400">Zatím žádné nabídky.</p>
      ) : (
        <ul>
          {offers.map((o) => (
            <li
              key={o.id}
              className={`group flex flex-col gap-1.5 border-b border-stone-100 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3 ${
                o.selected ? "bg-stone-50" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-stone-900">
                  {o.selected && <Check className="size-3.5 text-stone-900" />}
                  <span className="font-medium">{o.vendorLabel}</span>
                  {o.price != null && (
                    <span className="font-mono text-stone-700">{formatCurrency(o.price)}</span>
                  )}
                  {o.score != null && (
                    <span className="border border-stone-300 px-1 text-[10px] font-medium text-stone-700">
                      {o.score} b
                    </span>
                  )}
                </p>
                <p className="kicker mt-0.5">
                  {o.deliveryDate ? `do ${formatDate(o.deliveryDate)}` : "termín neurčen"}
                  {o.rating ? ` · ${o.rating}` : ""}
                  {!o.canEdit ? ` · ${statusLabel(o.status)}` : ""}
                </p>
                {o.note && <p className="mt-0.5 text-xs text-stone-500">{o.note}</p>}

                {/* Přílohy nabídky */}
                {(o.docs.length > 0 || o.canEdit) && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
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
                        {o.canEdit && (
                          <DeleteButton action={deleteDocument} fields={{ id: d.id }} confirm="Smazat přílohu?" />
                        )}
                      </span>
                    ))}
                    {o.canEdit && (
                      <form action={attachOfferFile}>
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
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {o.canEdit && <OfferStatusSelect id={o.id} status={o.status} statuses={statuses} />}
                {isOwner && (
                  <form action={selectOffer}>
                    <input type="hidden" name="id" value={o.id} />
                    <button
                      type="submit"
                      title={o.selected ? "Zrušit výběr" : "Vybrat tuto nabídku"}
                      className={`whitespace-nowrap border px-2 py-1 text-[11px] transition-colors cursor-pointer ${
                        o.selected
                          ? "border-stone-950 bg-stone-950 text-white"
                          : "border-stone-300 text-stone-600 hover:border-stone-950 hover:bg-stone-950 hover:text-white"
                      }`}
                    >
                      {o.selected ? "Vybráno" : "Vybrat"}
                    </button>
                  </form>
                )}
                {o.canEdit && (
                  <span className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <OfferForm
                      mode="edit"
                      offer={o}
                      vendors={vendors}
                      trigger={(open) => (
                        <button
                          type="button"
                          onClick={open}
                          title="Upravit nabídku"
                          className="flex size-7 items-center justify-center text-stone-400 hover:bg-stone-950 hover:text-white cursor-pointer"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                    />
                    <DeleteButton action={deleteOffer} fields={{ id: o.id }} confirm="Smazat tuto nabídku?" />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
