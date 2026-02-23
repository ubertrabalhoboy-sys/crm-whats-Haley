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
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-900/10 bg-white shadow-[0_10px_25px_rgba(0,0,0,0.06)]">
      <div className="sticky top-0 z-[2] flex items-center gap-2.5 border-b border-slate-900/10 bg-white p-3">
        <div>
          <div className="text-sm font-black tracking-[0.2px]">Conversas</div>
          <div className="text-xs text-slate-500">Inbox WhatsApp</div>
        </div>

        <button
          onClick={onRefresh}
          className="ml-auto cursor-pointer rounded-[10px] border border-slate-900/10 bg-white px-2.5 py-2 font-bold"
        >
          {loadingChats ? "Carregando..." : "Atualizar"}
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto p-3">
        {error && (
          <div className="mb-2.5 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[13px] font-bold text-rose-800">
            {error}
          </div>
        )}

        {chats.length === 0 && !loadingChats && (
          <div className="text-[13px] text-slate-500">
            Sem conversas ainda. Envie um webhook de teste.
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {chats.map((c) => {
            const active = c.id === selectedChatId;
            const title = c.contacts?.name || c.contacts?.phone || c.wa_chat_id || "Sem nome";

            return (
              <button
                key={c.id}
                onClick={() => onSelectChat(c.id)}
                className={`cursor-pointer rounded-[14px] border p-3 text-left ${
                  active
                    ? "border-indigo-500/45 bg-indigo-500/10 shadow-[0_10px_24px_rgba(99,102,241,0.12)]"
                    : "border-slate-900/10 bg-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black">{title}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {c.last_message || "(sem mensagem)"}
                    </div>
                  </div>

                  {!!c.unread_count && c.unread_count > 0 && (
                    <span className="rounded-full bg-gray-900 px-2 py-0.5 text-xs font-black text-white">
                      {c.unread_count}
                    </span>
                  )}
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <span className="rounded-full border border-slate-900/10 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
                    {c.kanban_status || "Novo"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {c.updated_at ? new Date(c.updated_at).toLocaleString("pt-BR") : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
