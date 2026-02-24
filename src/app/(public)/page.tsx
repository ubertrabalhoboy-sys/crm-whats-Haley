import CursorFollowButton from "../../components/public/CursorFollowButton";

export default function Home() {
  return (
    <main className="relative min-h-screen text-white">
      <div className="relative mx-auto max-w-6xl px-6 py-10">
        <header className="glass-panel glass-card flex items-center justify-between gap-4 rounded-2xl px-4 py-3 shadow-2xl shadow-black/30">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 shadow-lg shadow-orange-500/25" />
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-tight text-white">CRM Whats</div>
              <div className="text-xs text-slate-300">
                Atendimento e vendas no WhatsApp com controle real da operação.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 sm:inline">
              Online agora
            </span>

            <CursorFollowButton href="/login" variant="glass" className="px-4 py-2 text-sm font-semibold">
              Entrar
            </CursorFollowButton>

            <CursorFollowButton href="/signup" variant="primary" className="px-4 py-2 text-sm font-extrabold">
              Criar conta →
            </CursorFollowButton>
          </div>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="glass-panel glass-card rounded-3xl p-6 shadow-2xl shadow-black/40">
            <div className="mb-4 flex flex-wrap gap-2">
              {[
                "Dashboard",
                "Inbox",
                "Kanban",
                "Automações",
                "Relatórios",
              ].map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200"
                >
                  {chip}
                </span>
              ))}
            </div>

            <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
              Seu CRM de WhatsApp
              <br />
              <span className="bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-200 bg-clip-text text-transparent">
                pronto para vender mais
              </span>
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Centralize conversas, acompanhe leads no Kanban e automatize ações com botões.
              Menos operação manual. Mais velocidade no atendimento e conversão.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <CursorFollowButton href="/signup" variant="primary" className="rounded-2xl px-5 py-3 text-sm font-extrabold">
                Começar agora →
              </CursorFollowButton>

              <CursorFollowButton href="/inbox" variant="glass" className="rounded-2xl px-5 py-3 text-sm font-semibold">
                Ver Inbox
              </CursorFollowButton>

              <CursorFollowButton href="/dashboard" variant="glass" className="rounded-2xl px-5 py-3 text-sm font-semibold">
                Ver Dashboard
              </CursorFollowButton>
            </div>

            <div className="mt-6 text-xs text-slate-400">
              Ideal para equipes comerciais, atendimento e operações multi-loja.
            </div>
          </div>

          <aside className="glass-panel glass-card rounded-3xl p-6 shadow-2xl shadow-black/40">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              O que você ganha
            </div>

            <div className="mt-4 grid gap-3">
              {[
                ["Inbox organizado", "Converse por cliente, com histórico e contexto em segundos."],
                ["Kanban de leads", "Visualize o funil e mova oportunidades com clareza."],
                ["Automações úteis", "Acione respostas e mudanças de estágio por clique de botão."],
                ["Gestão da operação", "Acompanhe volume e evolução sem planilhas espalhadas."],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-extrabold text-white">{title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-300">{desc}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-orange-400/20 bg-gradient-to-br from-orange-500/10 to-amber-400/5 p-4">
              <div className="text-sm font-extrabold text-white">Rápido para começar</div>
              <div className="mt-1 text-xs leading-5 text-slate-300">
                Entre, conecte o WhatsApp e comece a operar em um fluxo claro para o time.
              </div>
            </div>
          </aside>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} CRM Whats</span>
          <span>online • versão SaaS</span>
        </footer>
      </div>
    </main>
  );
}
