import Link from "next/link";
import { Inter } from "next/font/google";
import SignOutButton from "@/components/auth/SignOutButton";

const inter = Inter({ subsets: ["latin"] });

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.className} min-h-screen bg-[#05060a] text-zinc-100`}>
      {/* Background: glow + noise */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1100px_600px_at_20%_10%,rgba(249,115,22,0.18),transparent_60%),radial-gradient(900px_600px_at_85%_20%,rgba(163,230,53,0.10),transparent_55%),radial-gradient(800px_500px_at_40%_90%,rgba(59,130,246,0.08),transparent_55%)]" />
        <div className="absolute inset-0 opacity-40 bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20200%20200%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.65%22%20numOctaves%3D%223%22%20stitchTiles%3D%22stitch%22/%3E%3C/filter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23n)%22%20opacity%3D%220.05%22/%3E%3C/svg%3E')]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/40" />
      </div>

      <div className="min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-white/5 p-5 text-zinc-100 backdrop-blur-xl md:flex">
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 shadow-lg shadow-orange-500/20" />
              <div className="leading-tight">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                  CRM Whats
                </p>
                <p className="mt-1 text-lg font-semibold text-white">Painel SaaS</p>
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            <Link
              href="/dashboard"
              className="group flex items-center justify-between rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-zinc-200 hover:border-white/10 hover:bg-white/5"
            >
              <span>Dashboard</span>
              <span className="text-zinc-500 group-hover:text-zinc-300">→</span>
            </Link>

            <Link
              href="/inbox"
              className="group flex items-center justify-between rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-zinc-200 hover:border-white/10 hover:bg-white/5"
            >
              <span>Inbox</span>
              <span className="text-zinc-500 group-hover:text-zinc-300">→</span>
            </Link>

            <Link
              href="/kanban"
              className="group flex items-center justify-between rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-zinc-200 hover:border-white/10 hover:bg-white/5"
            >
              <span>Kanban</span>
              <span className="text-zinc-500 group-hover:text-zinc-300">→</span>
            </Link>
          </nav>

          <div className="mt-auto pt-6">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <SignOutButton />
            </div>
          </div>
        </aside>

        <div className="md:pl-64">
          <header className="sticky top-0 z-30 border-b border-white/10 bg-white/5 backdrop-blur-xl">
            <div className="flex h-16 items-center justify-between px-4 md:px-8">
              <div className="leading-tight">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                  SaaS WhatsApp
                </p>
                <p className="text-base font-semibold text-white">Área Principal</p>
              </div>

              <Link
                href="/inbox"
                className="rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 px-4 py-2 text-sm font-extrabold text-slate-950 shadow-lg shadow-orange-500/20 hover:brightness-110"
              >
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