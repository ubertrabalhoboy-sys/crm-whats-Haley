export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-10 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute top-10 right-10 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-10">
        <header className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 shadow-lg shadow-orange-500/20" />
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-tight">CRM Whats</div>
              <div className="text-xs text-slate-300/80">
                Painel SaaS • WhatsApp • Automação
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200/80 sm:inline">
              ✅ Projeto rodando
            </span>

            <a
              href="/login"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Entrar
            </a>

            <a
              href="/signup"
              className="rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 px-4 py-2 text-sm font-extrabold text-slate-950 shadow-lg shadow-orange-500/20 hover:brightness-110"
            >
              Criar conta →
            </a>
          </div>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur">
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              Atendimento, vendas e automações
              <br />
              <span className="bg-gradient-to-br from-orange-500 to-amber-400 bg-clip-text text-transparent">
                em um só painel
              </span>
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-200/75">
              Inbox em tempo real + Kanban de leads + automações e relatórios.
              Visual premium e pronto pra escalar com múltiplos restaurantes.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {["Dashboard", "Inbox", "Kanban", "Automações", "Relatórios", "Configurações"].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200/85"
                >
                  {t}
                </span>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="/inbox"
                className="rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 px-5 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-orange-500/20 hover:brightness-110"
              >
                Abrir Inbox →
              </a>

              <a
                href="/dashboard"
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                Ver Dashboard
              </a>
            </div>

            <div className="mt-6 text-xs text-slate-300/60">
              Deslogado: essa tela funciona como a “carta de apresentação” do seu SaaS.
            </div>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="text-xs font-semibold text-slate-300/70">O que você ganha</div>

            <div className="mt-3 grid gap-3">
              {[
                ["Inbox organizado", "Conversas separadas por cliente e status."],
                ["Kanban de leads", "Pipeline de venda + remarketing."],
                ["Automações", "Botões, carrossel, follow-up e regras."],
                ["Relatórios", "Acompanhe volume, tempo e conversão."],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-extrabold">{title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-200/70">{desc}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
              <div className="text-sm font-extrabold">Pronto pra produção</div>
              <div className="mt-1 text-xs leading-5 text-slate-200/75">
                Visual premium, rápido e direto — ideal pra primeira impressão.
              </div>
            </div>
          </aside>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-slate-400/70">
          <span>© {new Date().getFullYear()} CRM Whats</span>
          <span>online • versão inicial</span>
        </footer>
      </div>
    </main>
  );
}