import "./globals.css";
import Link from "next/link";
import { Inter } from "next/font/google";
import SignOutButton from "@/components/auth/SignOutButton";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "CRM Whats",
  description: "Sistema CRM WhatsApp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} min-h-screen bg-slate-50 text-slate-900`}>
        <div className="min-h-screen">
          <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-slate-900 p-5 text-slate-100 md:flex">
            <div className="mb-8">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">CRM Whats</p>
              <p className="mt-2 text-lg font-semibold">Painel SaaS</p>
            </div>

            <nav className="space-y-1">
              <Link
                href="/dashboard"
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
              >
                Dashboard
              </Link>
              <Link
                href="/inbox"
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
              >
                Inbox
              </Link>
              <Link
                href="/kanban"
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
              >
                Kanban
              </Link>
              <Link
                href="#"
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Automações
              </Link>
              <Link
                href="#"
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Relatórios
              </Link>
              <Link
                href="#"
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Configurações
              </Link>
            </nav>

            <div className="mt-auto pt-6">
              <SignOutButton />
            </div>
          </aside>

          <div className="md:pl-60">

            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
              <div className="flex h-16 items-center justify-between px-4 md:px-8">
                <div>
                  <p className="text-sm text-slate-500">SaaS WhatsApp</p>
                  <p className="text-base font-semibold">Área Principal</p>
                </div>
                <Link
                  href="/inbox"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Abrir Inbox
                </Link>
              </div>
            </header>

            <main className="p-4 md:p-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}

