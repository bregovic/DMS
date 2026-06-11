import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { Sidebar } from "@/components/app/sidebar";
import { UserMenu } from "@/components/app/user-menu";
import { MobileNav } from "@/components/app/mobile-nav";
import { MobileTabBar } from "@/components/app/mobile-tabbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen bg-[#f4f3f0]">
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-stone-200 bg-white px-4 py-6 shadow-[8px_0_28px_-24px_rgba(41,37,36,0.45)] md:flex">
        <Link href="/dashboard" className="mb-10 block px-2">
          <span className="display text-2xl tracking-tight text-stone-950">
            DMS
          </span>
        </Link>
        <Sidebar />
        <div className="mt-auto px-2">
          <p className="kicker">v0.1 · MVP</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-stone-300/80 px-4 sm:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <MobileNav />
            <Link href="/dashboard">
              <span className="display text-xl text-stone-950">DMS</span>
            </Link>
          </div>
          <div className="flex-1" />
          <UserMenu name={user.name} email={user.email} />
        </header>
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-8 sm:pt-8 md:pb-8 lg:px-12">
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
