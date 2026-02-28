"use client";

import React, { type RefObject } from "react";
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

const MemoizedMessageBubble = React.memo(({ m }: { m: Msg }) => {
  const isIn = m.direction === "in";

  return (
    <div
      className={`max-w-[72%] px-3 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.05)] ${isIn
        ? "self-start bg-white/80 backdrop-blur-sm text-slate-800 rounded-3xl rounded-tl-none border border-white"
        : "self-end bg-[#086788] text-white rounded-3xl rounded-tr-none"
        }`}
    >
      <div className="whitespace-pre-wrap text-sm">{m.text || "(sem texto)"}</div>

      <div className={`mt-2 flex items-center justify-end gap-2 text-[11px] ${isIn ? "text-slate-600" : "text-white/80"}`}>
        <span>{new Date(m.created_at).toLocaleString("pt-BR")}</span>

        {m.direction === "out" && (
          <span className="font-black">
            {m.status === "sent" && "✓"}
            {m.status === "delivered" && "✓✓"}
            {m.status === "read" && <span className="text-[#07a0c3]">✓✓</span>}
          </span>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.m.id === next.m.id && prev.m.status === next.m.status;
});

export default function ChatPanel({
  selectedChat,
  selectedChatId,
  messages,
  loadingMsgs,
  hasNewWhileUp,
  msgsWrapRef,
  bottomRef,
  topObserverRef,
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
  topObserverRef?: RefObject<HTMLDivElement | null>;
  onMsgsScroll: () => void;
  onJumpToLatest: () => void;
  onSend: (text: string) => Promise<void>;
}) {
  return (
    <main className="flex min-h-0 min-w-0 h-[calc(100vh-250px)] flex-col overflow-hidden rounded-[2rem] bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 transition-all duration-500">
      <div className="sticky top-0 z-[2] border-b wa-divider bg-white/35 p-3 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-900">
              {selectedChat
                ? (selectedChat.contacts?.name || selectedChat.contacts?.phone || selectedChat.wa_chat_id)?.includes("@")
                  ? (selectedChat.contacts?.name || selectedChat.contacts?.phone || selectedChat.wa_chat_id)?.split("@")[0]
                  : (selectedChat.contacts?.name || selectedChat.contacts?.phone || selectedChat.wa_chat_id)
                : "Selecione uma conversa"}
            </div>
            <div className="truncate text-xs text-slate-600">
              {selectedChat?.wa_chat_id?.includes("@") ? selectedChat.wa_chat_id.split("@")[0] : selectedChat?.wa_chat_id ?? ""}
            </div>
          </div>

          <span className="rounded-full border wa-divider bg-white/45 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-all">
            {selectedChat?.kanban_status || "Novo"}
          </span>
        </div>

        {selectedChat?.is_typing && (
          <div className="mt-1.5 text-xs font-semibold text-[#128C7E] animate-pulse">digitando...</div>
        )}
      </div>

      <div
        ref={msgsWrapRef}
        onScroll={onMsgsScroll}
        className="relative flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-[radial-gradient(900px_320px_at_50%_0%,rgba(18,140,126,0.08)_0%,rgba(255,255,255,0.0)_58%),linear-gradient(180deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.05)_100%)] p-3.5 scroll-smooth"
      >
        {/* Infinite Scroll trigger target */}
        <div ref={topObserverRef} className="h-4 w-full shrink-0" />

        {loadingMsgs && messages.length === 0 ? (
          <div className="flex flex-col gap-4 w-full mt-2">
            <div className="self-start bg-white/30 animate-pulse rounded-3xl rounded-tl-none border border-white/40 h-14 w-[65%]" />
            <div className="self-end bg-indigo-100/30 animate-pulse rounded-3xl rounded-tr-none h-12 w-[55%]" />
            <div className="self-start bg-white/30 animate-pulse rounded-3xl rounded-tl-none border border-white/40 h-20 w-[45%]" />
          </div>
        ) : (
          <>
            {messages.length === 0 && selectedChatId && !loadingMsgs && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 opacity-60">
                <span className="text-sm font-medium">Nenhuma mensagem encontrada</span>
                <span className="text-xs">Inicie uma conversa abaixo</span>
              </div>
            )}

            {messages.map((m) => (
              <MemoizedMessageBubble key={m.id} m={m} />
            ))}
          </>
        )}

        {hasNewWhileUp && (
          <div className="pointer-events-none sticky bottom-3 flex justify-center z-[5] animate-in fade-in slide-in-from-bottom-4">
            <button
              onClick={onJumpToLatest}
              className="pointer-events-auto wa-btn wa-btn-glass cursor-pointer rounded-full px-4 py-2 text-[13px] font-bold text-slate-700 shadow-2xl shadow-[#086788]/20 bg-white/80 border border-white hover:scale-105 active:scale-95 transition-all"
            >
              ⬇ Novas mensagens
            </button>
          </div>
        )}

        <div ref={bottomRef} className="h-1 shrink-0" />
      </div>

      <SendBox disabled={!selectedChatId} onSend={onSend} messages={messages} />
    </main>
  );
}

