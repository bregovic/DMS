"use client";

import { useRef, useState, useTransition } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { createTask, deleteTask, updateTodo } from "@/server/actions/tasks";
import { TaskDoneCheckbox } from "@/components/tasks/task-done-checkbox";
import { DeleteButton } from "@/components/ui/delete-button";
import { PRIORITIES, priorityColor, priorityLabel } from "@/lib/constants";
import { colorClasses } from "@/lib/status-colors";

export type TodoItem = {
  id: string;
  title: string;
  priority: string | null;
  ready: boolean;
  done: boolean;
  vendorId: string | null;
  vendorName: string | null;
  createdAt: string;
  /** Smí upravovat (správce / autor). */
  canEdit: boolean;
  /** Smí odškrtnout a přepnout připraveno (i přidělený dodavatel). */
  canStatus: boolean;
};

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * Pořadí: nehotové nahoře, z nich nejdřív připravené (to jde dělat hned),
 * pak podle priority a nakonec podle toho, co přibylo dřív.
 */
function byUrgency(a: TodoItem, b: TodoItem) {
  if (a.ready !== b.ready) return a.ready ? -1 : 1;
  const pa = PRIORITY_RANK[a.priority ?? ""] ?? 3;
  const pb = PRIORITY_RANK[b.priority ?? ""] ?? 3;
  if (pa !== pb) return pa - pb;
  return a.createdAt.localeCompare(b.createdAt);
}

const selectClass =
  "h-8 border border-stone-300 bg-white px-2 text-xs text-stone-700 focus-visible:border-stone-950 focus-visible:outline-none";

/**
 * Todo list úkolů mimo plánování (#28).
 *
 * Věci typu "koupit hmoždinky", "zavolat elektrikáři": bez termínů a fází,
 * v Ganttu se neukazují. Přidávají se jedním řádkem (Enter), priorita,
 * připravenost a dodavatel se mění rovnou v řádku.
 */
export function TodoList({
  projectId,
  subProjectId,
  items,
  vendors,
  canAdd,
}: {
  projectId: string;
  subProjectId?: string;
  items: TodoItem[];
  vendors: { id: string; name: string }[];
  canAdd: boolean;
}) {
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const open = items.filter((i) => !i.done).sort(byUrgency);
  const done = items.filter((i) => i.done);

  function patch(id: string, field: string, value: string) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set(field, value);
    start(async () => {
      try {
        await updateTodo(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Změna se nezdařila.");
      }
    });
  }

  return (
    <div className="mb-8 border border-stone-200 bg-white shadow-soft">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <h3 className="kicker">Todo · {open.length}</h3>
        <span className="text-[11px] text-stone-400">mimo plánování</span>
      </div>

      {canAdd && (
        <form
          ref={formRef}
          action={async (fd) => {
            setError(null);
            // Nezaškrtnuté políčko se ve formuláři neodešle vůbec - bez tohohle
            // by server vzal výchozí "připraveno" i u úkolu, který čeká.
            if (!fd.has("ready")) fd.set("ready", "0");
            try {
              await createTask(fd);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Uložení selhalo.");
              return;
            }
            // Formulář zůstává otevřený a kurzor v názvu - zapisuje se
            // obvykle víc věcí za sebou.
            if (titleRef.current) titleRef.current.value = "";
            titleRef.current?.focus();
          }}
          className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-4 py-3"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="subProjectId" value={subProjectId ?? ""} />
          <input type="hidden" name="kind" value="todo" />
          <input
            ref={titleRef}
            name="title"
            required
            autoComplete="off"
            enterKeyHint="done"
            placeholder="Přidat úkol… (Enter)"
            aria-label="Název úkolu"
            className="h-9 min-w-0 flex-1 basis-56 border border-stone-300 px-3 text-sm focus-visible:border-stone-950 focus-visible:outline-none"
          />
          <select name="priority" defaultValue="" aria-label="Priorita" className={`${selectClass} h-9`}>
            <option value="">Priorita</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {vendors.length > 0 && (
            <select name="vendorId" defaultValue="" aria-label="Dodavatel" className={`${selectClass} h-9 max-w-40`}>
              <option value="">Dodavatel</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          <label className="flex h-9 cursor-pointer items-center gap-1.5 text-xs text-stone-600">
            <input type="checkbox" name="ready" value="1" defaultChecked className="size-4 accent-stone-900" />
            připraveno
          </label>
          <button
            type="submit"
            aria-label="Přidat"
            className="flex size-9 items-center justify-center border border-stone-950 bg-stone-950 text-white transition-colors hover:bg-stone-800 cursor-pointer"
          >
            <Plus className="size-4" />
          </button>
        </form>
      )}

      {error && <p className="px-4 pt-3 text-xs text-red-600">{error}</p>}

      {open.length === 0 ? (
        <p className="px-4 py-5 text-sm text-stone-500">
          {done.length ? "Všechno hotovo." : "Zatím nic. Napiš první úkol a Enter."}
        </p>
      ) : (
        <ul className={pending ? "opacity-70" : undefined}>
          {open.map((t) => (
            <TodoRow key={t.id} t={t} vendors={vendors} patch={patch} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="border-t border-stone-100">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex w-full items-center gap-1.5 px-4 py-2.5 text-xs text-stone-500 hover:text-stone-950 cursor-pointer"
          >
            <ChevronDown className={`size-3.5 transition-transform ${showDone ? "rotate-180" : ""}`} />
            Hotové · {done.length}
          </button>
          {showDone && (
            <ul>
              {done.map((t) => (
                <TodoRow key={t.id} t={t} vendors={vendors} patch={patch} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TodoRow({
  t,
  vendors,
  patch,
}: {
  t: TodoItem;
  vendors: { id: string; name: string }[];
  patch: (id: string, field: string, value: string) => void;
}) {
  const prio = colorClasses(priorityColor(t.priority));
  return (
    <li className="group flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-stone-100 px-4 py-2.5 first:border-t-0">
      {t.canStatus ? (
        <TaskDoneCheckbox id={t.id} done={t.done} />
      ) : (
        <span className="size-5 shrink-0" />
      )}
      <span
        className={`min-w-0 flex-1 basis-40 text-sm ${
          t.done ? "text-stone-400 line-through" : "text-stone-950"
        }`}
      >
        {t.title}
      </span>

      <div className="flex flex-wrap items-center gap-2 pl-8 sm:pl-0">
        {/* Připraveno / čeká - jedním klikem */}
        {!t.done &&
          (t.canStatus ? (
            <button
              type="button"
              onClick={() => patch(t.id, "ready", t.ready ? "0" : "1")}
              title={t.ready ? "Připraveno – kliknutím přepnout na čeká" : "Čeká – kliknutím přepnout na připraveno"}
              className={`h-7 border px-2 text-[11px] uppercase tracking-wide transition-colors cursor-pointer ${
                t.ready
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-600"
                  : "border-stone-300 bg-stone-50 text-stone-500 hover:border-stone-950"
              }`}
            >
              {t.ready ? "připraveno" : "čeká"}
            </button>
          ) : (
            <span className="text-[11px] uppercase tracking-wide text-stone-500">
              {t.ready ? "připraveno" : "čeká"}
            </span>
          ))}

        {t.canEdit ? (
          <select
            value={t.priority ?? ""}
            onChange={(e) => patch(t.id, "priority", e.target.value)}
            aria-label="Priorita"
            className={`${selectClass} ${t.priority ? prio.chip : ""}`}
          >
            <option value="">bez priority</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        ) : (
          t.priority && (
            <span className={`border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${prio.chip}`}>
              {priorityLabel(t.priority)}
            </span>
          )
        )}

        {t.canEdit && vendors.length > 0 ? (
          <select
            value={t.vendorId ?? ""}
            onChange={(e) => patch(t.id, "vendorId", e.target.value)}
            aria-label="Dodavatel"
            className={`${selectClass} max-w-40`}
          >
            <option value="">bez dodavatele</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        ) : (
          t.vendorName && <span className="text-xs text-stone-500">{t.vendorName}</span>
        )}

        {t.canEdit && (
          <span className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <DeleteButton action={deleteTask} fields={{ id: t.id }} confirm="Smazat tento úkol?" />
          </span>
        )}
      </div>
    </li>
  );
}
