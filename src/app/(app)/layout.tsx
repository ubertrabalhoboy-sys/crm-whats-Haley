import Link from "next/link";
import { Inter } from "next/font/google";
import SignOutButton from "../../components/auth/SignOutButton";
import ParticleBg from "../../components/shared/ParticleBg";

const inter = Inter({ subsets: ["latin"] });

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.className} wa-app-shell relative min-h-screen text-slate-900`}>
      <ParticleBg />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-white/40 via-transparent to-[#ECE5DD]/45" />

      <div className="min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r wa-divider wa-glass p-5 text-slate-900 md:flex">
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#128C7E] to-[#34d399] shadow-lg shadow-emerald-500/20" />
              <div className="leading-tight">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">CRM Whats</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">Painel SaaS</p>
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            <Link href="/dashboard" className="group flex items-center justify-between rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-900/10 hover:bg-white/40">
              <span>Dashboard</span>
              <span className="text-slate-400 group-hover:text-slate-700">→</span>
            </Link>
            <Link href="/inbox" className="group flex items-center justify-between rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-900/10 hover:bg-white/40">
              <span>Inbox</span>
              <span className="text-slate-400 group-hover:text-slate-700">→</span>
            </Link>
            <Link href="/kanban" className="group flex items-center justify-between rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-900/10 hover:bg-white/40">
              <span>Kanban</span>
              <span className="text-slate-400 group-hover:text-slate-700">→</span>
            </Link>
          </nav>

          <div className="mt-auto pt-6">
            <div className="rounded-2xl border wa-divider wa-card p-3">
              <SignOutButton />
            </div>
          </div>
        </aside>

        <div className="md:pl-64">
          <header className="wa-topbar sticky top-0 z-30 border-b wa-divider backdrop-blur-xl">
            <div className="flex h-16 items-center justify-between px-4 md:px-8">
              <div className="leading-tight">
                <p className="text-xs uppercase tracking-[0.22em] text-white/75">SaaS WhatsApp</p>
                <p className="text-base font-semibold text-white">Área Principal</p>
              </div>

              <Link href="/inbox" className="wa-btn wa-btn-primary rounded-xl px-4 py-2 text-sm font-bold text-white">
                Abrir Inbox →
              </Link>
            </div>
          </header>

          <main className="p-4 md:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
