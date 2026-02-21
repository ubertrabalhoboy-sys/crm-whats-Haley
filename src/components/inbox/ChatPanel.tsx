"use client";

import type { RefObject } from "react";
import SendBox from "./SendBox";

type Chat = {
  wa_chat_id: string | null;
  kanban_status: string | null;
  contacts?: { phone: string | null; name: string | null } | null;
  is_typing?: boolean | null;
};

type Msg = {
  id: string;
  direction: "in" | "out";
  text: string | null;
  created_at: string;
  status?: "sent" | "delivered" | "read";
};

export default function ChatPanel({
  selectedChat,
  selectedChatId,
  messages,
  loadingMsgs,
  hasNewWhileUp,
  msgsWrapRef,
  bottomRef,
  onMsgsScroll,
  onJumpToLatest,
  onSend,
}: {
  selectedChat: Chat | null;
  selectedChatId: string | null;
  messages: Msg[];
  loadingMsgs: boolean;
  hasNewWhileUp: boolean;
  msgsWrapRef: RefObject<HTMLDivElement | null>;
  bottomRef: RefObject<HTMLDivElement | null>;
  onMsgsScroll: () => void;
  onJumpToLatest: () => void;
  onSend: (text: string) => Promise<void>;
}) {
  return (
    <main className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-900/10 bg-white shadow-[0_10px_25px_rgba(0,0,0,0.06)]">
      <div className="sticky top-0 z-[2] border-b border-slate-900/10 bg-white p-3">
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black">
              {selectedChat
                ? selectedChat.contacts?.name ||
                  selectedChat.contacts?.phone ||
                  selectedChat.wa_chat_id
                : "Selecione uma conversa"}
            </div>
            <div className="text-xs text-slate-500">{selectedChat?.wa_chat_id ?? ""}</div>
          </div>

          <span className="rounded-full border border-slate-900/10 bg-slate-50 px-2.5 py-1.5 text-xs font-extrabold text-slate-700">
            {selectedChat?.kanban_status || "Novo"}
          </span>
        </div>

        {selectedChat?.is_typing && (
          <div className="mt-1.5 text-xs font-extrabold text-green-500">digitando...</div>
        )}
      </div>

      <div
        ref={msgsWrapRef}
        onScroll={onMsgsScroll}
        className="relative flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto bg-[radial-gradient(1200px_400px_at_50%_0%,rgba(99,102,241,0.12)_0%,rgba(255,255,255,1)_45%)] p-3.5"
      >
        {loadingMsgs && <div className="text-slate-500">Carregando mensagens...</div>}

        {!loadingMsgs && messages.length === 0 && selectedChatId && (
          <div className="text-slate-500">Sem mensagens nesse chat.</div>
        )}

        {messages.map((m) => {
          const isIn = m.direction === "in";

          return (
            <div
              key={m.id}
              className={`max-w-[72%] rounded-[14px] border border-slate-900/10 px-3 py-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.04)] ${
                isIn ? "self-start bg-white" : "self-end bg-indigo-500/10"
              }`}
            >
              <div className="whitespace-pre-wrap text-sm text-slate-900">{m.text || "(sem texto)"}</div>

              <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-slate-500">
                <span>{new Date(m.created_at).toLocaleString("pt-BR")}</span>

                {m.direction === "out" && (
                  <span className="font-black">
                    {m.status === "sent" && "✓"}
                    {m.status === "delivered" && "✓✓"}
                    {m.status === "read" && <span className="text-blue-500">✓✓</span>}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {hasNewWhileUp && (
          <div className="pointer-events-none sticky bottom-3 flex justify-center">
            <button
              onClick={onJumpToLatest}
              className="pointer-events-auto cursor-pointer rounded-full border border-slate-900/10 bg-white px-3.5 py-2.5 font-black shadow-[0_14px_30px_rgba(0,0,0,0.10)]"
            >
              ⬇️ Novas mensagens
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <SendBox disabled={!selectedChatId} onSend={onSend} />
    </main>
  );
}
