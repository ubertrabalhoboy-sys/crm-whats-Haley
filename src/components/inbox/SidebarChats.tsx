"use client";

type Chat = {
  id: string;
  wa_chat_id: string | null;
  kanban_status: string | null;
  last_message: string | null;
  unread_count: number | null;
  updated_at: string | null;
  contacts?: { phone: string | null; name: string | null } | null;
};

export default function SidebarChats({
  chats,
  selectedChatId,
  loadingChats,
  error,
  onRefresh,
  onSelectChat,
}: {
  chats: Chat[];
  selectedChatId: string | null;
  loadingChats: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectChat: (chatId: string) => void;
}) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[2rem] bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5">
      <div className="sticky top-0 z-[2] flex items-center gap-2.5 border-b wa-divider bg-white/35 p-3 backdrop-blur-xl">
        <div>
          <div className="text-sm font-black uppercase tracking-widest text-[#086788]">Conversas</div>
          <div className="text-xs text-slate-600">Inbox WhatsApp</div>
        </div>

        <button
          onClick={onRefresh}
          className="wa-btn wa-btn-glass ml-auto cursor-pointer rounded-[10px] px-2.5 py-2 text-sm font-semibold text-slate-700"
        >
          {loadingChats ? "Carregando..." : "Atualizar"}
        </button>
      </div>

      <div className="min-h-0 h-full overflow-y-auto p-3">
        {error && (
          <div className="mb-2.5 rounded-xl border border-rose-500/20 bg-rose-50/70 p-2.5 text-[13px] font-semibold text-rose-700">
            {error}
          </div>
        )}

        {chats.length === 0 && !loadingChats && (
          <div className="text-[13px] text-slate-600">
            Sem conversas ainda. Envie um webhook de teste.
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {loadingChats ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white/20 animate-pulse rounded-2xl h-16 w-full" />
            ))
          ) : (
            chats.map((c) => {
              const active = c.id === selectedChatId;
              const title = c.contacts?.name || c.contacts?.phone || c.wa_chat_id || "Sem nome";

              return (
                <button
                  key={c.id}
                  onClick={() => onSelectChat(c.id)}
                  className={`cursor-pointer border p-3 text-left transition-all duration-300 rounded-2xl ${active
                    ? "border-[#128C7E]/30 bg-white/60 ring-1 ring-[#128C7E]/20 shadow-[0_10px_24px_rgba(18,140,126,0.10)]"
                    : "wa-card hover:shadow-[0_8px_20px_rgba(18,140,126,0.08)] hover:bg-white/40"
                    }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="min-w-0 flex-1 relative">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#07a0c3] animate-pulse"></div>
                        <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-600">
                        {c.last_message || "(sem mensagem)"}
                      </div>
                    </div>

                    {!!c.unread_count && c.unread_count > 0 && (
                      <span className="rounded-full bg-[#25D366] px-2 py-0.5 text-xs font-black text-white">
                        {c.unread_count}
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="rounded-full border wa-divider bg-white/45 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {c.kanban_status || "Novo"}
                    </span>
                    <span className="truncate text-xs text-slate-500">
                      {c.updated_at ? new Date(c.updated_at).toLocaleString("pt-BR") : ""}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
