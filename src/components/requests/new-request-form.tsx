"use client";

import { useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { createRequest, updateRequest } from "@/server/actions/requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { REQUEST_UNITS } from "@/lib/constants";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export type RequestInitial = {
  id: string;
  title: string;
  description: string | null;
  quantity: number | null;
  unit: string;
  category: string;
  price: number | null;
  vendorId: string | null;
  requiredDate: string | null; // YYYY-MM-DD
};

/** Pole žádanky – stejná pro novou i úpravu. */
function RequestFields({
  initial,
  vendors,
  categories,
}: {
  initial?: RequestInitial;
  vendors: { id: string; name: string }[];
  categories: { key: string; label: string }[];
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="title">Co se poptává</Label>
        <Input
          id="title"
          name="title"
          placeholder="Např. Cihly Porotherm 30"
          defaultValue={initial?.title}
          required
          autoFocus={!initial}
        />
      </div>

      <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="quantity">Množství</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            step="0.01"
            min="0"
            placeholder="0"
            defaultValue={initial?.quantity ?? undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit">Jednotka</Label>
          <select id="unit" name="unit" defaultValue={initial?.unit ?? "ks"} className={fieldClass}>
            {REQUEST_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Kategorie</Label>
          <select
            id="category"
            name="category"
            defaultValue={initial?.category ?? "materials"}
            className={fieldClass}
          >
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 items-end gap-4">
        <div className="space-y-1.5">
          <Label>Dodavatel (volitelné)</Label>
          <Combobox
            name="vendorId"
            items={vendors.map((v) => ({ id: v.id, label: v.name }))}
            defaultId={initial?.vendorId ?? undefined}
            placeholder="Hledat dodavatele…"
            emptyLabel="— zatím neurčen —"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="requiredDate">Požadované datum</Label>
          <DateInput id="requiredDate" name="requiredDate" defaultValue={initial?.requiredDate ?? undefined} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="price">Cena / nabídka (volitelné)</Label>
        <Input
          id="price"
          name="price"
          type="number"
          step="0.01"
          min="0"
          placeholder="0"
          defaultValue={initial?.price ?? undefined}
        />
        <p className="text-xs text-stone-400">S dodavatelem + cenou lze ze žádanky založit výdaj.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Specifikace (volitelné)</Label>
        <textarea
          id="description"
          name="description"
          rows={initial ? 5 : 2}
          defaultValue={initial?.description ?? undefined}
          placeholder="Typ, rozměry, poznámky…"
          className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950"
        />
      </div>
    </>
  );
}

export function NewRequestForm({
  projectId,
  subProjectId,
  vendors,
  categories,
  triggerClassName,
}: {
  projectId: string;
  subProjectId?: string;
  vendors: { id: string; name: string }[];
  categories: { key: string; label: string }[];
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className={triggerClassName}>
        <Plus className="size-4" />
        Žádanka
      </Button>
    );
  }

  return (
    <Dialog title="Nová žádanka" size="lg" onClose={() => setOpen(false)}>
      <form
        ref={formRef}
        action={async (fd) => {
          await createRequest(fd);
          formRef.current?.reset();
          setOpen(false);
        }}
        className="space-y-5 p-5"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="subProjectId" value={subProjectId ?? ""} />
        <RequestFields vendors={vendors} categories={categories} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Zrušit
          </Button>
          <Button type="submit">Uložit poptávku</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/**
 * Detail a úprava žádanky. Spouští se kliknutím na název žádanky
 * (nebo tužkou) – specifikace byla dřív vidět jen při zakládání.
 */
export function EditRequestForm({
  projectId,
  request,
  vendors,
  categories,
  trigger,
}: {
  projectId: string;
  request: RequestInitial;
  vendors: { id: string; name: string }[];
  categories: { key: string; label: string }[];
  /** Obsah tlačítka, které dialog otevře (např. název žádanky). */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer text-left"
        title="Detail a úprava žádanky"
        aria-label={trigger ? undefined : "Upravit žádanku"}
      >
        {trigger ?? <Pencil className="size-3.5 text-stone-400 hover:text-stone-950" />}
      </button>

      {open && (
        <Dialog title="Žádanka" size="lg" onClose={() => setOpen(false)}>
          <form
            action={async (fd) => {
              setError(null);
              setBusy(true);
              try {
                await updateRequest(fd);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Uložení selhalo.");
                setBusy(false);
                return;
              }
              setBusy(false);
              setOpen(false);
            }}
            className="space-y-5 p-5"
          >
            <input type="hidden" name="id" value={request.id} />
            <input type="hidden" name="projectId" value={projectId} />
            <RequestFields initial={request} vendors={vendors} categories={categories} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Zrušit
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Ukládám…" : "Uložit"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      )}
    </>
  );
}
