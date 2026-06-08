import { FolderKanban } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
            <FolderKanban className="size-6" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">DMS</h1>
          <p className="text-sm text-slate-500">Výdaje &amp; dokumenty</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
