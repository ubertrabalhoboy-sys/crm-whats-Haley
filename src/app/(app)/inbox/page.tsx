"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import ChatPanel from "@/components/inbox/ChatPanel";
import DetailsPanel from "@/components/inbox/DetailsPanel";
import SidebarChats from "@/components/inbox/SidebarChats";

type Chat = {
  id: string;
  wa_chat_id: string | null;
  kanban_status: string | null;
  sentiment?: string | null;
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

type ChatListResponse = {
  ok: boolean;
  chats: Chat[];
};

type MessagesPageResponse = {
  ok: boolean;
  messages: Msg[];
};

const EMPTY_CHATS: Chat[] = [];

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Erro de Fetch");
  return json;
};

export default function InboxPage() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [hasNewWhileUp, setHasNewWhileUp] = useState(false);
  const [optimisticMsgs, setOptimisticMsgs] = useState<Msg[]>([]);
  const prevChatsRef = useRef<Chat[]>([]);
  const [orderedChatIds, setOrderedChatIds] = useState<string[]>([]);

  // Polling logic: 2s when focused, 5s when blurred
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  useEffect(() => {
    const onFocus = () => setIsWindowFocused(true);
    const onBlur = () => setIsWindowFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // SWR for Chats list
  const {
    data: chatsData,
    error: chatsError,
    mutate: mutateChats,
  } = useSWR<ChatListResponse>(`/api/chats`, fetcher, {
    refreshInterval: isWindowFocused ? 2000 : 5000,
    revalidateOnFocus: true,
    onSuccess: (data) => {
      const nextChats = data.chats ?? EMPTY_CHATS;
      const currentChatIds = nextChats.map((c) => c.id);

      setOrderedChatIds((prevOrderedIds) => {
        if (nextChats.length === 0) {
          return prevOrderedIds.length > 0 ? [] : prevOrderedIds;
        }

        if (prevOrderedIds.length === 0) {
          return currentChatIds;
        }

        const needsReorder = nextChats.some((newChat) => {
          const oldChat = prevChatsRef.current.find((c) => c.id === newChat.id);
          if (!oldChat) return true;

          if (newChat.last_message !== oldChat.last_message) return true;

          if (newChat.unread_count && (!oldChat.unread_count || newChat.unread_count > oldChat.unread_count)) {
            return true;
          }

          return false;
        });

        if (needsReorder) {
          return currentChatIds;
        }

        const filteredPreviousIds = prevOrderedIds.filter((id) => currentChatIds.includes(id));
        if (filteredPreviousIds.length !== prevOrderedIds.length) {
          return filteredPreviousIds;
        }

        return prevOrderedIds;
      });

      prevChatsRef.current = nextChats;
    },
  });

  const rawChats = chatsData?.chats ?? EMPTY_CHATS;
  const loadingChats = !chatsData && !chatsError;
  const error = chatsError?.message || null;

  const chats = useMemo(() => {
    const chatMap = new Map(rawChats.map(c => [c.id, c]));
    // Return chats in the order defined by orderedChatIds, followed by any new ones
    const sorted = orderedChatIds
      .map(id => chatMap.get(id))
      .filter((c): c is Chat => !!c);

    // Catch-all for chats not in ordered list yet
    const remaining = rawChats.filter(c => !orderedChatIds.includes(c.id));
    return [...remaining, ...sorted];
  }, [rawChats, orderedChatIds]);

  const activeChatId = selectedChatId ?? chats[0]?.id ?? null;

  // SWR Infinite for Messages
  const getKey = (pageIndex: number, previousPageData: MessagesPageResponse | null) => {
    if (!activeChatId) return null;
    if (previousPageData && previousPageData.messages.length === 0) return null;
    let url = `/api/chats/${activeChatId}/messages?limit=30`;
    if (pageIndex > 0 && previousPageData && previousPageData.messages.length > 0) {
      const oldestMsg = previousPageData.messages[0];
      url += `&cursor=${encodeURIComponent(oldestMsg.created_at)}`;
    }
    return url;
  };

  const {
    data: msgsPages,
    error: msgsError,
    mutate: mutateMsgs,
    size,
    setSize,
    isValidating: isValidatingMsgs,
  } = useSWRInfinite<MessagesPageResponse>(getKey, fetcher, {
    refreshInterval: activeChatId && isWindowFocused ? 2000 : 0,
    revalidateOnFocus: true,
  });

  const messages = useMemo(() => {
    if (!msgsPages) return optimisticMsgs;
    const allFetched = msgsPages
      .map(page => page.messages || [])
      .reverse()
      .flat();

    const uniqueOptimistic = optimisticMsgs.filter(
      opt => !allFetched.some(f => f.direction === opt.direction && f.text === opt.text)
    );
    return [...allFetched, ...uniqueOptimistic];
  }, [msgsPages, optimisticMsgs]);

  const loadingMsgs = (!msgsPages && !msgsError) || (msgsPages && size > 0 && typeof msgsPages[size - 1] === "undefined");
  const isReachingEnd = msgsPages && msgsPages[msgsPages.length - 1]?.messages?.length < 30;

  const msgsWrapRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const topObserverRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const lastScrollHeightRef = useRef<number>(0);
  const isSwitchingChatRef = useRef(false);

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) ?? null,
    [activeChatId, chats]
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

  // Read message marking + Optimistic update
  useEffect(() => {
    if (!activeChatId) return;

    isSwitchingChatRef.current = true;
    shouldAutoScrollRef.current = true;

    // Optimistic unread zeroing
    mutateChats((data?: ChatListResponse) => {
      if (!data) return data;
      return {
        ...data,
        chats: data.chats.map((c) => (c.id === activeChatId ? { ...c, unread_count: 0 } : c)),
      };
    }, false);

    fetch(`/api/chats/${activeChatId}/read`, { method: "POST" }).then(() => {
      mutateChats();
    });
  }, [activeChatId, mutateChats]);

  // Infinite Scroll Observer
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const target = entries[0];
    if (target.isIntersecting && !isReachingEnd && !loadingMsgs) {
      if (msgsWrapRef.current) {
        lastScrollHeightRef.current = msgsWrapRef.current.scrollHeight;
        shouldAutoScrollRef.current = false;
      }
      setSize(size + 1);
    }
  }, [isReachingEnd, loadingMsgs, size, setSize]);

  useEffect(() => {
    const option = { root: msgsWrapRef.current, rootMargin: "200px", threshold: 0 };
    const observer = new IntersectionObserver(handleObserver, option);
    if (topObserverRef.current) observer.observe(topObserverRef.current);
    return () => observer.disconnect();
  }, [handleObserver]);

  // Scroll management
  useEffect(() => {
    if (msgsWrapRef.current && lastScrollHeightRef.current > 0 && !shouldAutoScrollRef.current) {
      const el = msgsWrapRef.current;
      const heightDiff = el.scrollHeight - lastScrollHeightRef.current;
      if (heightDiff > 0) {
        el.scrollTop += heightDiff;
        lastScrollHeightRef.current = 0;
      }
    }
  }, [messages.length]);

  useEffect(() => {
    if (!activeChatId || !messages.length) return;
    if (!shouldAutoScrollRef.current) return;

    if (isSwitchingChatRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom("auto");
        isSwitchingChatRef.current = false;
      });
    } else {
      scrollToBottom("smooth");
    }
  }, [activeChatId, hasNewWhileUp, messages.length]);

  return (
    <div className="h-full max-h-full w-full flex flex-col overflow-hidden bg-[#f0f2f5] rounded-[2.5rem] p-3.5 shadow-inner">
      <div className="flex flex-1 min-h-0 gap-3.5 overflow-hidden">
        <div className="w-[320px] min-w-[320px] max-w-[400px] flex-shrink-0 h-full flex flex-col min-h-0">
          <SidebarChats
            chats={chats}
            selectedChatId={activeChatId}
            loadingChats={loadingChats}
            error={error}
            onRefresh={() => mutateChats()}
            onSelectChat={(chatId) => {
              if (chatId === activeChatId) return;
              setHasNewWhileUp(false);
              setOptimisticMsgs([]);
              setSelectedChatId(chatId);
            }}
          />
        </div>

        <div className="flex-1 min-w-0 h-full flex flex-col min-h-0">
          <ChatPanel
            selectedChat={selectedChat}
            selectedChatId={activeChatId}
            messages={messages}
            loadingMsgs={loadingMsgs || isValidatingMsgs}
            hasNewWhileUp={hasNewWhileUp}
            msgsWrapRef={msgsWrapRef}
            bottomRef={bottomRef}
            topObserverRef={topObserverRef}
            onMsgsScroll={handleMsgsScroll}
            onJumpToLatest={() => {
              setHasNewWhileUp(false);
              shouldAutoScrollRef.current = true;
              requestAnimationFrame(() => scrollToBottom("smooth"));
            }}
            onSend={async (text) => {
              if (!activeChatId) return;
              shouldAutoScrollRef.current = true;
              setHasNewWhileUp(false);
              const tempId = "temp-" + Date.now();
              const optimisticMsg: Msg = { id: tempId, direction: "out", text, created_at: new Date().toISOString(), status: "sent" };
              setOptimisticMsgs((prev) => [...prev, optimisticMsg]);
              setTimeout(() => scrollToBottom("smooth"), 50);
              try {
                const res = await fetch("/api/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: activeChatId, text }), });
                const json = await res.json();
                if (!json.ok) console.error("Falha ao enviar via API");
              } catch (err) {
                console.error("Erro ao enviar mensagem", err);
              }
              mutateMsgs();
              mutateChats();
            }}
          />
        </div>

        <div className="hidden xl:flex w-[360px] flex-shrink-0 h-full flex flex-col min-h-0">
          <DetailsPanel selectedChat={selectedChat} messages={messages} />
        </div>
      </div>
    </div>
  );
}
