import Link from "next/link";
import { AlertTriangle, Bell, ClipboardList, Receipt, Wallet } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { ensureReminders } from "@/server/notify";
import { markAllRead } from "@/server/actions/notifications";
import { EmptyState } from "@/components/ui/empty-state";

const ICON: Record<string, typeof Bell> = {
  task_assigned: ClipboardList,
  expense_added: Receipt,
  doc_uploaded: Receipt,
  doc_scan_ready: Receipt,
  reminder: AlertTriangle,
  invoice_requested: Wallet,
  invoice_paid: Wallet,
};

/**
 * Oznámení: přidělené úkoly, výdaje od ostatních, připomínky (po termínu,
 * blížící se fáze bez dodavatele, objednat do), žádosti o úhradu.
 * Nepřečtená jsou zvýrazněná; otevřením stránky se označí jako přečtená.
 */
export default async function NotificationsPage() {
  const user = await requireUser();
  await ensureReminders(user).catch(() => {});
  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);
  // Zobrazením se nepřečtená označí jako přečtená (zvýraznění zůstane do obnovení).
  if (unreadIds.length)
    await prisma.notification.updateMany({ where: { id: { in: unreadIds } }, data: { readAt: new Date() } });

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <div>
          <h1 className="display text-4xl text-stone-950">Oznámení</h1>
          <p className="kicker mt-1">{unreadIds.length ? `${unreadIds.length} nových` : "vše přečteno"}</p>
        </div>
        {unreadIds.length > 0 && (
          <form action={markAllRead}>
            <button type="submit" className="h-8 cursor-pointer border border-stone-300 px-3 text-xs text-stone-700 hover:border-stone-950">
              Označit vše jako přečtené
            </button>
          </form>
        )}
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Žádná oznámení"
          description="Objeví se tu přidělené úkoly, výdaje od ostatních v tvých projektech, připomínky termínů a žádosti o úhradu."
        />
      ) : (
        <ul>
          {items.map((n) => {
            const Icon = ICON[n.kind] ?? Bell;
            const fresh = unreadIds.includes(n.id);
            const body = (
              <div className={`flex gap-3 border-b border-stone-200 px-2 py-3 ${fresh ? "bg-amber-50/70" : ""}`}>
                <Icon className={`mt-0.5 size-4 shrink-0 ${n.kind === "reminder" ? "text-orange-600" : "text-stone-500"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${fresh ? "font-medium text-stone-950" : "text-stone-800"}`}>{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-stone-500">{n.body}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-stone-400">
                  {n.createdAt.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
            return (
              <li key={n.id}>
                {n.href ? (
                  <Link href={n.href} className="block hover:bg-stone-50">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
