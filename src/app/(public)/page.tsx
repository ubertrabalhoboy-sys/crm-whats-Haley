import CursorFollowButton from "../../components/public/CursorFollowButton";

export default function Home() {
  return (
    <main className="relative min-h-screen text-slate-900">
      <div className="relative mx-auto max-w-6xl px-6 py-10">
        <header className="wa-card flex items-center justify-between gap-4 rounded-2xl px-4 py-3 shadow-xl shadow-emerald-900/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#128C7E] to-[#25D366] shadow-lg shadow-emerald-500/20" />
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-tight text-slate-900">CRM Whats</div>
              <div className="text-xs text-slate-600">Atendimento, vendas e operação no WhatsApp em um só lugar.</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border wa-divider bg-white/40 px-3 py-1 text-xs text-slate-600 sm:inline">
              Online agora
            </span>
            <CursorFollowButton href="/login" variant="glass" className="px-4 py-2 text-sm font-semibold">Entrar</CursorFollowButton>
            <CursorFollowButton href="/signup" variant="primary" className="px-4 py-2 text-sm font-extrabold">Criar conta →</CursorFollowButton>
          </div>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="wa-card rounded-3xl p-6 shadow-xl shadow-emerald-900/5">
            <div className="mb-4 flex flex-wrap gap-2">
              {["Dashboard", "Inbox", "Kanban", "Automações", "Relatórios"].map((chip) => (
                <span key={chip} className="rounded-full border wa-divider bg-white/35 px-3 py-1 text-xs font-medium text-slate-700">
                  {chip}
                </span>
              ))}
            </div>

            <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-5xl">
              WhatsApp com gestão de verdade
              <br />
              <span className="bg-gradient-to-r from-[#075E54] via-[#128C7E] to-[#0ea5e9] bg-clip-text text-transparent">
                sem perder leads no caminho
              </span>
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Centralize conversas, acompanhe o funil no Kanban e automatize ações com segurança. Fluxo simples para operar melhor e vender mais.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <CursorFollowButton href="/signup" variant="primary" className="rounded-2xl px-5 py-3 text-sm font-extrabold">Começar agora →</CursorFollowButton>
              <CursorFollowButton href="/inbox" variant="glass" className="rounded-2xl px-5 py-3 text-sm font-semibold">Ver Inbox</CursorFollowButton>
              <CursorFollowButton href="/dashboard" variant="glass" className="rounded-2xl px-5 py-3 text-sm font-semibold">Ver Dashboard</CursorFollowButton>
            </div>

            <div className="mt-6 text-xs text-slate-500">Feito para times comerciais, atendimento e operações multi-unidade.</div>
          </div>

          <aside className="wa-card rounded-3xl p-6 shadow-xl shadow-emerald-900/5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">O que você ganha</div>
            <div className="mt-4 grid gap-3">
              {[
                ["Inbox organizado", "Converse por cliente com histórico e contexto."],
                ["Kanban visual", "Acompanhe oportunidades por estágio com clareza."],
                ["Automações úteis", "Acione ações por botão e reduza tarefas manuais."],
                ["Visão da operação", "Monitore volume e evolução sem planilhas."],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-2xl border wa-divider bg-white/30 p-4">
                  <div className="text-sm font-bold text-slate-900">{title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">{desc}</div>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} CRM Whats</span>
          <span>online • versão SaaS</span>
        </footer>
      </div>
    </main>
  );
}
