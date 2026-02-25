"use client";

type Chat = {
  wa_chat_id: string | null;
  kanban_status: string | null;
  contacts?: { phone: string | null; name: string | null } | null;
};

export default function DetailsPanel({ selectedChat }: { selectedChat: Chat | null }) {
  return (
    <aside className="hidden lg:flex min-h-0 min-w-0 h-full flex-col overflow-hidden rounded-[2rem] bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5">
      <div className="sticky top-0 z-[2] border-b wa-divider bg-white/35 p-3 backdrop-blur-xl">
        <div className="text-sm font-semibold text-slate-900">Detalhes</div>
        <div className="text-xs text-slate-600">Perfil e Kanban</div>
      </div>

      <div className="min-h-0 h-full overflow-y-auto p-3">
        {!selectedChat && <div className="text-slate-600">Selecione uma conversa.</div>}

        {selectedChat && (
          <div className="flex flex-col gap-3">
            <div className="wa-card rounded-[14px] p-3">
              <div className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#07a0c3]">Contato</div>
              <div className="text-[13px] text-slate-700">
                <div>Nome: {selectedChat.contacts?.name || "-"}</div>
                <div>Telefone: {selectedChat.contacts?.phone?.replace("@s.whatsapp.net", "") || "-"}</div>
              </div>
            </div>

            <div className="wa-card rounded-[14px] p-3">
              <div className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#07a0c3]">Kanban</div>
              <div className="text-[13px] text-slate-700">
                <div>Status atual: {selectedChat.kanban_status || "Novo"}</div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Próximo passo: dropdown pra mudar status e disparar automação.
              </div>
            </div>

            <div className="mt-4 rounded-[14px] bg-gradient-to-br from-[#086788] to-[#07a0c3] p-4 text-white shadow-lg">
              <div className="mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-white/80">SaaS Intelligence</div>
              <div className="text-xs text-white/90">
                Análise com IA em breve.
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
