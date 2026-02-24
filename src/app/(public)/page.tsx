import NexbotAuraBackground from "@/components/public/NexbotAuraBackground";
import CursorFollowButton from "@/components/public/CursorFollowButton";

export default function Home() {
  return (
    <main className="relative min-h-screen text-slate-900">
      <NexbotAuraBackground />

      <div className="relative mx-auto max-w-6xl px-6 py-10">
        <header className="glass-panel glass-card flex items-center justify-between gap-4 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-xl shadow-slate-200/60">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 shadow-lg shadow-slate-300/60" />
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-tight text-slate-900">
                CRM Whats
              </div>
              <div className="text-xs text-slate-600">
                Atendimento e vendas no WhatsApp, em um só lugar.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 sm:inline">
              Online agora
            </span>

            {/* Entrar (glass claro) */}
            <CursorFollowButton
              href="/login"
              variant="glass"
              className="cf-glass-light px-4 py-2 text-slate-700"
            >
              Entrar
            </CursorFollowButton>

            {/* Criar conta (slate escuro) */}
            <CursorFollowButton
              href="/signup"
              variant="glass"
              className="cf-slate px-4 py-2 text-white"
            >
              Criar conta →
            </CursorFollowButton>
          </div>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="glass-panel glass-card rounded-3xl border border-white/70 bg-white/85 p-6 shadow-2xl shadow-slate-200/70">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              Organize atendimento, vendas e follow-up
              <br />
              <span className="bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-transparent">
                em um painel simples de operar
              </span>
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Centralize conversas, acompanhe leads no Kanban e automatize respostas no WhatsApp.
              Mais agilidade para vender, atender melhor e não perder oportunidades.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {/* Abrir Inbox (slate escuro) */}
              <CursorFollowButton
                href="/inbox"
                variant="glass"
                className="cf-slate px-5 py-3 text-white rounded-2xl"
              >
                Abrir Inbox →
              </CursorFollowButton>

              {/* Ver Dashboard (glass claro) */}
              <CursorFollowButton
                href="/dashboard"
                variant="glass"
                className="cf-glass-light px-5 py-3 text-slate-700 rounded-2xl"
              >
                Ver Dashboard
              </CursorFollowButton>
            </div>

            <div className="mt-6 text-xs text-slate-500">
              Feito para equipes que precisam responder rápido e vender com consistência.
            </div>
          </div>

          <aside className="glass-panel glass-card rounded-3xl border border-white/70 bg-white/85 p-6 shadow-2xl shadow-slate-200/70">
            <div className="text-xs font-semibold text-slate-500">O que você ganha</div>

            <div className="mt-3 grid gap-3">
              {[
                ["Inbox organizado", "Converse por cliente, com histórico e status em um só lugar."],
                ["Kanban de leads", "Visualize o funil e mova oportunidades com clareza."],
                ["Automações", "Dispare ações por botão e reduza trabalho manual."],
                ["Visão de operação", "Acompanhe volume e evolução comercial sem planilhas."],
              ].map(([title, desc]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100"
                >
                  <div className="text-sm font-extrabold text-slate-900">{title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">{desc}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
              <div className="text-sm font-extrabold text-slate-900">Pronto para escalar</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">
                Uma experiência clara e profissional para sua operação começar bem desde o primeiro acesso.
              </div>
            </div>
          </aside>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} CRM Whats</span>
          <span>online • plataforma SaaS</span>
        </footer>
      </div>
    </main>
  );
}