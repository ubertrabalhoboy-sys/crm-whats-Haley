"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import SignOutButton from "../../components/auth/SignOutButton";
import ParticleBg from "../../components/shared/ParticleBg";
import ConnectionAlert from "../../components/shared/ConnectionAlert";

import {
  LayoutDashboard,
  Inbox,
  Kanban,
  Users,
  BarChart3,
  Bell,
  ChevronRight,
  Plus,
  Zap,
  LogOut,
  Gift,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

// --- COMPONENTES DE UI COM GUIA DE ESTILO CRM WHATS ---

function GlowButton({
  children,
  variant = "blue",
  className = "",
  asChild = false,
  href,
  type,
  onClick,
}: {
  children: React.ReactNode;
  variant?: "blue" | "dark" | "red";
  className?: string;
  asChild?: boolean;
  href?: string;
  type?: "button" | "submit";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}) {
  const styles: Record<string, string> = {
    blue:
      "bg-blue-500/10 backdrop-blur-xl border border-blue-400/40 text-blue-600 shadow-[0_0_20px_rgba(37,99,235,0.1),inset_0_0_12px_rgba(37,99,235,0.2)] hover:bg-blue-600 hover:text-white hover:shadow-[0_0_35px_rgba(37,99,235,0.4),inset_0_0_20px_rgba(255,255,255,0.2)] hover:border-blue-300",
    dark:
      "bg-slate-900/10 backdrop-blur-xl border border-slate-700/40 text-slate-800 shadow-[0_0_20px_rgba(15,23,42,0.05),inset_0_0_12px_rgba(15,23,42,0.1)] hover:bg-slate-900 hover:text-white hover:shadow-[0_0_35px_rgba(15,23,42,0.3),inset_0_0_20px_rgba(255,255,255,0.1)] hover:border-slate-500",
    red:
      "bg-red-500/10 backdrop-blur-xl border border-red-400/40 text-red-600 shadow-[0_0_20px_rgba(239,68,68,0.1),inset_0_0_12px_rgba(239,68,68,0.2)] hover:bg-red-600 hover:text-white hover:shadow-[0_0_35px_rgba(239,68,68,0.4),inset_0_0_20px_rgba(255,255,255,0.2)] hover:border-red-300",
  };

  const base =
    `px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all duration-500 active:scale-95 flex items-center gap-3 ` +
    `${styles[variant]} ${className}`;

  if (asChild && href) {
    return (
      <Link href={href} className={base}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type ?? "button"} onClick={onClick} className={base}>
      {children}
    </button>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { id: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={20} /> },
    { id: "Inbox", href: "/inbox", icon: <Inbox size={20} /> },
    { id: "Kanban", href: "/kanban", icon: <Kanban size={20} /> },
    { id: "Promoções", href: "/promocoes", icon: <Gift size={20} /> },
    { id: "Contatos", href: "/contacts", icon: <Users size={20} /> }, // se não existir ainda, pode deixar (ou criar depois)
    { id: "Relatórios", href: "/reports", icon: <BarChart3 size={20} /> }, // se não existir ainda, pode deixar (ou criar depois)
  ];

  // Título do header baseado na rota atual (mantém visual do "activeTab")
  const activeTitle =
    navItems.find((i) => isActive(pathname, i.href))?.id ??
    (pathname.startsWith("/settings") ? "Configurações" : "Área");

  return (
    <div
      className={`${inter.className} h-screen w-full flex flex-col overflow-hidden bg-slate-200 text-slate-900 font-sans relative selection:bg-blue-200`}
    >
      <ConnectionAlert />

      <div className="flex-1 w-full flex p-6 gap-6 relative overflow-hidden">
        <ParticleBg />

        {/* Estilos CSS Injetados para Animações */}
        <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(1deg); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }

        .wa-glass {
          background: rgba(255, 255, 255, 0.3);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.5);
        }

        /* Custom Scrollbar */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(37, 99, 235, 0.1); border-radius: 10px; }
      `}</style>

        {/* Camadas de Fundo Decorativas */}
        <div className="fixed inset-0 -z-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-5%] w-[45%] h-[45%] bg-blue-400/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        </div>

        {/* --- SIDEBAR (GLASSMORPHISM) --- */}
        <aside className="w-80 flex flex-col wa-glass rounded-[3rem] p-8 shadow-2xl relative z-50">
          {/* Logo Section */}
          <div className="flex items-center gap-4 mb-14 px-2">
            <div className="h-14 w-14 rounded-[1.25rem] bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg shadow-blue-500/40 flex items-center justify-center animate-float">
              <Zap className="text-white fill-current" size={28} />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600">
                CRM Whats
              </p>
              <p className="text-2xl font-[900] text-[#0f172a] tracking-tighter uppercase leading-none">
                Painel SaaS
              </p>
            </div>
          </div>

          {/* Menu Principal - Modelo Vidro Colorido (Tinted Glass) */}
          <nav className="space-y-4 flex-grow overflow-y-auto h-full">
            <p className="px-4 text-[9px] font-black uppercase text-slate-400 tracking-[0.3em] mb-6">
              Navegação Principal
            </p>

            {navItems.map((item) => {
              const active = isActive(pathname, item.href);

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onMouseEnter={() => router.prefetch(item.href)}
                  className={`
                  w-full flex items-center justify-between p-5 rounded-[1.5rem] transition-all duration-500 group relative overflow-hidden
                  ${active
                      ? "bg-blue-600 text-white shadow-[0_20px_40px_-15px_rgba(37,99,235,0.4),inset_0_0_20px_rgba(255,255,255,0.2)] border border-blue-400/50"
                      : "bg-blue-500/5 backdrop-blur-md border border-blue-200/20 text-slate-500 hover:bg-blue-500/10 hover:text-blue-600 hover:border-blue-400/30 hover:shadow-[0_10px_30px_-10px_rgba(37,99,235,0.1)]"
                    }
                `}
                >
                  {active && (
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
                  )}

                  <div className="flex items-center gap-4 relative z-10">
                    <span
                      className={`
                      transition-colors duration-500
                      ${active ? "text-white" : "group-hover:text-blue-600"}
                    `}
                    >
                      {item.icon}
                    </span>
                    <span className="text-[11px] font-[900] uppercase tracking-widest">
                      {item.id}
                    </span>
                  </div>

                  <ChevronRight
                    size={14}
                    className={`
                    transition-all duration-500 relative z-10
                    ${active ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100 group-hover:translate-x-1"}
                  `}
                  />
                </Link>
              );
            })}
          </nav>

          {/* Botão Sair - Neon Glass Style */}
          <div className="mt-auto pt-8 border-t border-white/20">
            <div className="w-full">
              <div className="hidden">
                {/* mantém import do ícone e estilo como referência visual */}
                <LogOut size={18} />
              </div>

              {/* Não mexo na lógica do logout: seu componente faz isso */}
              <div className="w-full">
                <div className="w-full">
                  <div className="w-full">
                    <div className="w-full">
                      {/* “casca” visual */}
                      <div className="w-full">
                        <div className="w-full">
                          <div className="w-full">
                            <div className="w-full">
                              <div className="w-full">
                                <div className="w-full">
                                  <div className="w-full">
                                    <div className="w-full">
                                      <div className="w-full">
                                        <div className="w-full">
                                          <div className="w-full">
                                            {/* wrapper com o mesmo look do GlowButton red */}
                                            <div className="w-full">
                                              <div className="w-full">
                                                <div
                                                  className={
                                                    "w-full px-8 py-4 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] transition-all duration-300 flex items-center gap-3 justify-center " +
                                                    "bg-transparent border border-slate-200/50 text-black " +
                                                    "hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                                                  }
                                                >
                                                  <LogOut size={18} />
                                                  <SignOutButton />
                                                </div>
                                              </div>
                                            </div>
                                            {/* fim wrapper */}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </aside>

        {/* --- CONTEÚDO (MAIN AREA) --- */}
        <main className="flex-1 h-full overflow-hidden flex flex-col gap-8 pr-2">
          {/* Top Header */}
          <header className="flex items-center justify-between bg-white/20 backdrop-blur-xl border border-white/60 rounded-[3rem] px-10 py-7 shadow-sm">
            <div>
              <h2 className="text-3xl font-[900] text-[#0f172a] uppercase tracking-tighter mb-1">
                {activeTitle}
              </h2>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_#22c55e]" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">
                  Painel de Controlo em Tempo Real
                </p>
              </div>
            </div>

            <div className="flex items-center gap-5">
              {/* Botão de Notificação com estilo Tinted Glass */}
              <button className="relative p-3.5 bg-blue-500/5 backdrop-blur-md border border-blue-200/50 rounded-2xl text-blue-600 hover:text-white hover:bg-blue-600 hover:shadow-[0_0_20px_rgba(37,99,235,0.2)] transition-all duration-300">
                <Bell size={22} />
                <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-blue-600 rounded-full border-2 border-white" />
              </button>

              {/* “Novo atendimento” funcional -> manda pro Inbox */}
              <GlowButton asChild href="/inbox" variant="blue">
                <Plus size={18} strokeWidth={3} />
                NOVO ATENDIMENTO
              </GlowButton>
            </div>
          </header>

          {/* Conteúdo real da rota */}
          <div className="flex-1 h-full overflow-hidden">{children}</div>
        </main>
      </div>
    </div>
  );
}