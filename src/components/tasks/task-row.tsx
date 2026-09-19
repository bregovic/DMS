import { BULK_FORM_ID } from "@/lib/bulk-ids";
import { priorityColor, priorityLabel } from "@/lib/constants";
import { colorClasses } from "@/lib/status-colors";
import { formatCurrency, formatDate } from "@/lib/utils";
import { TaskStatusSelect } from "@/components/tasks/task-status-select";
import { TaskProgressInput } from "@/components/tasks/task-progress-input";
import { LogTaskExpense } from "@/components/tasks/log-task-expense";

export type TaskRowData = {
  id: string;
  title: string;
  kind: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  done: boolean;
  priority: string | null;
  profession?: string | null;
  ready?: boolean;
  dueDate: Date | null;
  estimateDays?: number | null;
  percentDone: number;
  description: string | null;
  /** Kde úkol je: projekt / složka / fáze (Moje úkoly). */
  context?: React.ReactNode;
  vendorName?: string | null;
  selfPerformed?: boolean;
  assigneeEmail?: string | null;
  createdByName?: string | null;
  prereqs?: { title: string; done: boolean }[];
  phaseKids?: { done: number; total: number };
  phaseWarn?: boolean;
  logged?: { amount: number; hours: number };
};

/**
 * Jeden řádek úkolu – stejný v plánu projektu i v Moje úkoly, ať jde
 * o můj úkol, nebo cizí: zaškrtávátko vybírá pro hromadnou lištu, stav,
 * průběh (%) a vykázání přímo v řádku, úpravy (extra) jen s oprávněním.
 */
export function TaskRow({
  t,
  level = 0,
  todayStart,
  statuses,
  canSelect,
  canStatus,
  canLog,
  defaultRate = null,
  extra,
}: {
  t: TaskRowData;
  level?: number;
  todayStart: Date;
  statuses: { key: string; label: string }[];
  canSelect: boolean;
  canStatus: boolean;
  canLog: boolean;
  defaultRate?: number | null;
  extra?: React.ReactNode;
}) {
  const isPhase = t.kind === "phase";
  const overdue = !t.done && !!t.dueDate && t.dueDate < todayStart;
  const col = colorClasses(t.statusColor);
  const blocked = (t.prereqs ?? []).filter((p) => !p.done);
  const due = t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null;
  const who = [
    t.vendorName ?? (t.selfPerformed ? "svépomocí" : null),
    t.assigneeEmail,
  ].filter(Boolean);

  return (
    <li
      className={`group flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-stone-200 py-3.5 ${
        isPhase ? "bg-stone-50/60" : ""
      }`}
      style={level > 0 ? { paddingLeft: `${level * 24}px` } : undefined}
    >
      <div className="flex min-w-0 flex-1 basis-60 items-start gap-2.5">
        {canSelect ? (
          <input
            type="checkbox"
            name="ids"
            value={t.id}
            form={BULK_FORM_ID}
            aria-label={`Vybrat: ${t.title}`}
            title="Vybrat pro hromadnou úpravu nebo vykázání"
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-stone-900"
          />
        ) : (
          <span className="mt-0.5 size-4 shrink-0" />
        )}
        <div className="min-w-0">
          {t.context && <p className="kicker mb-0.5 !text-stone-400">{t.context}</p>}
          <p
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium ${
              t.done ? "text-stone-400 line-through" : "text-stone-950"
            }`}
          >
            <span className={`size-2 shrink-0 rounded-full ${col.dot}`} title={t.statusLabel} />
            {isPhase && <span className="kicker !text-stone-500">Fáze</span>}
            {t.title}
            {t.phaseKids && t.phaseKids.total > 0 && (
              <span className="text-[11px] font-normal text-stone-500">
                {t.phaseKids.done}/{t.phaseKids.total} hotovo
              </span>
            )}
            {t.priority && (
              <span
                className={`border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${colorClasses(priorityColor(t.priority)).chip}`}
              >
                {priorityLabel(t.priority)}
              </span>
            )}
            {t.profession && (
              <span className="border border-stone-200 bg-stone-50 px-1.5 py-px text-[10px] font-normal uppercase tracking-wide text-stone-500">
                {t.profession}
              </span>
            )}
          </p>
          <p className="kicker mt-0.5">
            {who.length > 0 && `${who.join(" · ")} · `}
            {t.dueDate ? (
              <span className={overdue ? "text-red-600" : undefined}>do {formatDate(t.dueDate)}</span>
            ) : (
              "bez termínu"
            )}
            {t.estimateDays ? ` · odhad ${t.estimateDays} d` : ""}
            {!t.done && t.ready === false && <span className="text-amber-700"> · čeká</span>}
            {t.createdByName ? ` · zadal ${t.createdByName}` : ""}
          </p>
          {(t.prereqs?.length ?? 0) > 0 && (
            <p className={`mt-1 text-xs ${blocked.length ? "text-red-600" : "text-stone-500"}`}>
              {blocked.length ? "⛔ Čeká na: " : "↳ Navazuje na: "}
              {t.prereqs!.map((p) => p.title).join(", ")}
            </p>
          )}
          {t.phaseWarn && (
            <p className="mt-1 text-xs text-amber-700">⚠ Fáze začíná, ale dílčí úkoly ještě nejsou hotové.</p>
          )}
          {t.description && <p className="mt-1 max-w-xl text-sm text-stone-500">{t.description}</p>}
          {t.logged && t.logged.amount > 0 && (
            <p className="mt-1 text-xs text-stone-500">
              Vykázáno <span className="font-mono text-stone-800">{formatCurrency(t.logged.amount)}</span>
              {t.logged.hours > 0 ? ` · ${t.logged.hours.toLocaleString("cs-CZ")} h` : ""}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-7 sm:pl-0">
        {canStatus ? (
          <TaskStatusSelect id={t.id} status={t.status} statuses={statuses} />
        ) : (
          <span className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${col.chip}`}>{t.statusLabel}</span>
        )}
        {!isPhase && t.kind !== "todo" && !t.done &&
          (canStatus ? (
            <TaskProgressInput taskId={t.id} percent={t.percentDone} title={t.title} dueDate={due} />
          ) : (
            t.percentDone > 0 && <span className="text-xs text-stone-500">{t.percentDone} %</span>
          ))}
        {isPhase && !t.done && t.percentDone > 0 && <span className="text-xs text-stone-500">{t.percentDone} %</span>}
        {canLog && !isPhase && !t.done && (
          <LogTaskExpense
            taskId={t.id}
            taskTitle={t.title}
            defaultRate={defaultRate}
            percentDone={t.percentDone}
            dueDate={due}
          />
        )}
        {extra}
      </div>
    </li>
  );
}
