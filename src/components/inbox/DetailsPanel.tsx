"use client";

type Chat = {
  wa_chat_id: string | null;
  kanban_status: string | null;
  contacts?: { phone: string | null; name: string | null } | null;
};

export default function DetailsPanel({ selectedChat }: { selectedChat: Chat | null }) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-900/10 bg-white shadow-[0_10px_25px_rgba(0,0,0,0.06)]">
      <div className="sticky top-0 z-[2] border-b border-slate-900/10 bg-white p-3">
        <div className="text-sm font-black">Detalhes</div>
        <div className="text-xs text-slate-500">Perfil e Kanban</div>
      </div>

      <div className="min-h-0 overflow-auto p-3">
        {!selectedChat && <div className="text-slate-500">Selecione uma conversa.</div>}

        {selectedChat && (
          <div className="flex flex-col gap-3">
            <div className="rounded-[14px] border border-slate-900/10 bg-slate-50 p-3">
              <div className="mb-2 font-black">Contato</div>
              <div className="text-[13px] text-slate-700">
                <div>Nome: {selectedChat.contacts?.name || "-"}</div>
                <div>Telefone: {selectedChat.contacts?.phone || "-"}</div>
              </div>
            </div>

            <div className="rounded-[14px] border border-slate-900/10 bg-slate-50 p-3">
              <div className="mb-2 font-black">Kanban</div>
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
