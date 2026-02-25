"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ChatPanel from "@/components/inbox/ChatPanel";
import DetailsPanel from "@/components/inbox/DetailsPanel";
import SidebarChats from "@/components/inbox/SidebarChats";

type Chat = {
  id: string;
  wa_chat_id: string | null;
  kanban_status: string | null;
  last_message: string | null;
  unread_count: number | null;
  updated_at: string | null;
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

export default function InboxPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNewWhileUp, setHasNewWhileUp] = useState(false);

  const msgsAbortRef = useRef<AbortController | null>(null);
  const msgsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgsInFlightRef = useRef(false);
  const messagesByChatIdRef = useRef<Record<string, Msg[]>>({});
  const msgsWrapRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) ?? null,
    [chats, selectedChatId]
  );

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }

  function handleMsgsScroll() {
    const el = msgsWrapRef.current;
    if (!el) return;

    const threshold = 120;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= threshold;

    if (shouldAutoScrollRef.current && hasNewWhileUp) {
      setHasNewWhileUp(false);
    }
  }

  function sameMsgsQuick(a: Msg[], b: Msg[]) {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    if (a.length === 0) return true;
    const aLast = a[a.length - 1];
    const bLast = b[b.length - 1];
    return (
      aLast?.id === bLast?.id &&
      aLast?.created_at === bLast?.created_at &&
      aLast?.status === bLast?.status
    );
  }

  function sameChatsQuick(a: Chat[], b: Chat[]) {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    if (a.length === 0) return true;
    const aFirst = a[0];
    const bFirst = b[0];
    const aLast = a[a.length - 1];
    const bLast = b[b.length - 1];
    return (
      aFirst?.id === bFirst?.id &&
      aFirst?.updated_at === bFirst?.updated_at &&
      aLast?.id === bLast?.id &&
      aLast?.updated_at === bLast?.updated_at
    );
  }

  async function loadChats(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoadingChats(true);
    setError(null);
    try {
      const res = await fetch(`/api/chats?t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Falha ao buscar chats");
      const nextChats: Chat[] = json.chats || [];
      setChats((prev) => (sameChatsQuick(prev, nextChats) ? prev : nextChats));
      if (!selectedChatId && json.chats?.[0]?.id) setSelectedChatId(json.chats[0].id);
    } catch (e: any) {
      setError(e?.message ?? "Erro");
    } finally {
      if (!opts?.silent) setLoadingChats(false);
    }
  }

  async function loadMessages(chatId: string, opts?: { silent?: boolean; force?: boolean }) {
    if (msgsInFlightRef.current && !opts?.force) return;
    if (opts?.force && msgsAbortRef.current) {
      msgsAbortRef.current.abort();
      msgsInFlightRef.current = false;
    }
    if (msgsInFlightRef.current) return;
    msgsInFlightRef.current = true;

    if (msgsAbortRef.current) msgsAbortRef.current.abort();
    const controller = new AbortController();
    msgsAbortRef.current = controller;

    if (!opts?.silent) setLoadingMsgs(true);
    setError(null);

    try {
      const res = await fetch(`/api/chats/${chatId}/messages?t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
        signal: controller.signal,
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Falha ao buscar mensagens");

      setMessages((prev) => {
        const serverMsgs: Msg[] = json.messages || [];
        const cachedMsgs = messagesByChatIdRef.current[chatId] || [];
        const tempMsgs = [...cachedMsgs, ...prev].filter(
          (m, index, arr) =>
            String(m.id).startsWith("temp-") && arr.findIndex((x) => x.id === m.id) === index
        );

        const stillPending = tempMsgs.filter((t) => {
          return !serverMsgs.some(
            (s) => s.direction === t.direction && (s.text || "") === (t.text || "")
          );
        });

        const merged = [...serverMsgs, ...stillPending];
        merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        const prevMax = prev.length
          ? Math.max(...prev.map((m) => new Date(m.created_at).getTime()))
          : 0;
        const mergedMax = merged.length
          ? Math.max(...merged.map((m) => new Date(m.created_at).getTime()))
          : 0;

        if (mergedMax > prevMax && !shouldAutoScrollRef.current) {
          setHasNewWhileUp(true);
        }

        if (sameMsgsQuick(prev, merged)) {
          messagesByChatIdRef.current[chatId] = prev;
          return prev;
        }

        messagesByChatIdRef.current[chatId] = merged;
        return merged;
      });
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message ?? "Erro");
    } finally {
      msgsInFlightRef.current = false;
      if (!opts?.silent) setLoadingMsgs(false);
    }
  }

  useEffect(() => {
    loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadChats({ silent: true });
    }, 5000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) {
      if (msgsTimerRef.current) {
        clearInterval(msgsTimerRef.current);
        msgsTimerRef.current = null;
      }
      setMessages([]);
      setHasNewWhileUp(false);
      return;
    }

    shouldAutoScrollRef.current = true;
    setHasNewWhileUp(false);
    if (msgsTimerRef.current) {
      clearInterval(msgsTimerRef.current);
      msgsTimerRef.current = null;
    }

    const cached = messagesByChatIdRef.current[selectedChatId];
    if (cached?.length) {
      setMessages((prev) => (sameMsgsQuick(prev, cached) ? prev : cached));
    } else {
      setMessages([]);
    }

    loadMessages(selectedChatId);

    fetch(`/api/chats/${selectedChatId}/read`, { method: "POST" }).then(() => {
      loadChats({ silent: true });
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId]);

  useEffect(() => {
    if (msgsTimerRef.current) {
      clearInterval(msgsTimerRef.current);
      msgsTimerRef.current = null;
    }
    if (!selectedChatId) return;

    msgsTimerRef.current = setInterval(() => {
      loadMessages(selectedChatId, { silent: true });
    }, 2000);

    return () => {
      if (msgsTimerRef.current) {
        clearInterval(msgsTimerRef.current);
        msgsTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) return;
    if (!shouldAutoScrollRef.current) return;

    requestAnimationFrame(() => scrollToBottom("smooth"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedChatId]);

  return (
  <div className="relative h-screen w-full overflow-hidden bg-[#dee5e8] p-4">
    <style>{`
      .custom-scroll::-webkit-scrollbar { width: 5px; }
      .custom-scroll::-webkit-scrollbar-thumb { background: #07a0c3; border-radius: 10px; }
      .custom-scroll::-webkit-scrollbar-track { background: transparent; }

      .wa-bg-pattern {
        background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png');
        background-repeat: repeat;
        opacity: 0.04;
        filter: hue-rotate(160deg) saturate(0.5);
        position: absolute; inset: 0; z-index: 0;
        pointer-events: none;
      }
    `}</style>

    <div className="wa-bg-pattern" />

    {/* Shell premium: NADA muda na lógica interna */}
    <div className="relative z-10 grid h-full grid-cols-[320px_minmax(0,1fr)] gap-4 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      {/* Sidebar (origem: componente existente) */}
      <div className="h-full overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 shadow-lg shadow-[#086788]/5 backdrop-blur-xl">
        <SidebarChats
          chats={chats}
          selectedChatId={selectedChatId}
          loadingChats={loadingChats}
          error={error}
          onRefresh={loadChats}
          onSelectChat={(chatId) => {
            if (chatId === selectedChatId) return;
            setSelectedChatId(chatId);
            loadMessages(chatId, { force: true });
          }}
        />
      </div>

      {/* Chat panel */}
      <div className="h-full overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 shadow-lg shadow-[#086788]/5 backdrop-blur-xl">
        <ChatPanel
          selectedChat={selectedChat}
          selectedChatId={selectedChatId}
          messages={messages}
          loadingMsgs={loadingMsgs}
          hasNewWhileUp={hasNewWhileUp}
          msgsWrapRef={msgsWrapRef}
          bottomRef={bottomRef}
          onMsgsScroll={handleMsgsScroll}
          onJumpToLatest={() => {
            setHasNewWhileUp(false);
            shouldAutoScrollRef.current = true;
            requestAnimationFrame(() => scrollToBottom("smooth"));
          }}
          onSend={async (text) => {
            if (!selectedChatId) return;

            shouldAutoScrollRef.current = true;
            setHasNewWhileUp(false);

            const tempId = "temp-" + Date.now();
            setMessages((prev) => {
              const optimisticMsg: Msg = {
                id: tempId,
                direction: "out",
                text,
                created_at: new Date().toISOString(),
              };
              const next: Msg[] = [...prev, optimisticMsg];
              messagesByChatIdRef.current[selectedChatId] = next;
              return next;
            });

            setError(null);

            try {
              const res = await fetch("/api/messages/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: selectedChatId, text }),
              });

              const json = await res.json();
              if (!json.ok) setError(json.error || "Falha ao enviar");
            } catch {
              setError("Erro ao enviar mensagem");
            }

            loadMessages(selectedChatId);
            loadChats({ silent: true });
          }}
        />
      </div>

      {/* Details panel */}
      <div className="hidden h-full overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 shadow-lg shadow-[#086788]/5 backdrop-blur-xl xl:block">
        <DetailsPanel selectedChat={selectedChat} />
      </div>
    </div>
  </div>
);
  
}
