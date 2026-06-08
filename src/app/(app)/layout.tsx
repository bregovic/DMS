import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { Sidebar } from "@/components/app/sidebar";
import { UserMenu } from "@/components/app/user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <FolderKanban className="size-4" />
          </div>
          <span className="font-semibold text-slate-900">DMS</span>
        </Link>
        <Sidebar />
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
            <FolderKanban className="size-5 text-indigo-600" />
            <span className="font-semibold">DMS</span>
          </Link>
          <div className="flex-1" />
          <UserMenu name={user.name} email={user.email} />
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
