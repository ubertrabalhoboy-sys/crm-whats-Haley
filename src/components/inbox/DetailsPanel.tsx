"use client";

type Chat = {
  wa_chat_id: string | null;
  kanban_status: string | null;
  contacts?: { phone: string | null; name: string | null } | null;
};

export default function DetailsPanel({ selectedChat }: { selectedChat: Chat | null }) {
  return (
    <aside className="hidden lg:flex min-h-0 min-w-0 h-full flex-col overflow-hidden rounded-2xl border wa-divider wa-glass shadow-[0_12px_30px_rgba(18,140,126,0.06)]">
      <div className="sticky top-0 z-[2] border-b wa-divider bg-white/35 p-3 backdrop-blur-xl">
        <div className="text-sm font-semibold text-slate-900">Detalhes</div>
        <div className="text-xs text-slate-600">Perfil e Kanban</div>
      </div>

      <div className="min-h-0 h-full overflow-y-auto p-3">
        {!selectedChat && <div className="text-slate-600">Selecione uma conversa.</div>}

        {selectedChat && (
          <div className="flex flex-col gap-3">
            <div className="wa-card rounded-[14px] p-3">
              <div className="mb-2 font-semibold text-slate-900">Contato</div>
              <div className="text-[13px] text-slate-700">
                <div>Nome: {selectedChat.contacts?.name || "-"}</div>
                <div>Telefone: {selectedChat.contacts?.phone || "-"}</div>
              </div>
            </div>

            <div className="wa-card rounded-[14px] p-3">
              <div className="mb-2 font-semibold text-slate-900">Kanban</div>
              <div className="text-[13px] text-slate-700">
                <div>Status atual: {selectedChat.kanban_status || "Novo"}</div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Próximo passo: dropdown pra mudar status e disparar automação.
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
