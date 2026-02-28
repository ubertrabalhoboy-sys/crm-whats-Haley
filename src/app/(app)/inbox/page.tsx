"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";
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
  const { mutate } = useSWRConfig();

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
  } = useSWR<{ ok: boolean; chats: Chat[] }>(`/api/chats`, fetcher, {
    refreshInterval: isWindowFocused ? 2000 : 5000,
    revalidateOnFocus: true,
  });

  const rawChats = chatsData?.chats || [];
  const loadingChats = !chatsData && !chatsError;
  const error = chatsError?.message || null;

  // STABLE SORTING LOGIC:
  // We keep a local order of IDs that only changes when a NEW message arrives or is sent.
  const prevChatsRef = useRef<Chat[]>([]);
  const [orderedChatIds, setOrderedChatIds] = useState<string[]>([]);

  useEffect(() => {
    if (rawChats.length === 0) return;

    const currentChatIds = rawChats.map(c => c.id);

    // Initial load
    if (orderedChatIds.length === 0) {
      setOrderedChatIds(currentChatIds);
      prevChatsRef.current = rawChats;
      return;
    }

    // Check if any chat has a NEWER updated_at than what we have in ref
    // BUT ignore the one we just marked as read (if possible) or check if text changed
    const needsReorder = rawChats.some(newChat => {
      const oldChat = prevChatsRef.current.find(c => c.id === newChat.id);
      if (!oldChat) return true; // New chat entirely

      // If last_message changed, it's a real new message event
      if (newChat.last_message !== oldChat.last_message) return true;

      // If it's a new unread message in a chat that wasn't the active one
      if (newChat.unread_count && (!oldChat.unread_count || newChat.unread_count > oldChat.unread_count)) {
        return true;
      }

      return false;
    });

    if (needsReorder) {
      // Re-sort primarily by updated_at (server order is already newest first)
      setOrderedChatIds(currentChatIds);
    }

    prevChatsRef.current = rawChats;
  }, [rawChats, orderedChatIds.length]);

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

  // SWR Infinite for Messages
  const getKey = (pageIndex: number, previousPageData: any) => {
    if (!selectedChatId) return null;
    if (previousPageData && !previousPageData.messages?.length) return null;
    let url = `/api/chats/${selectedChatId}/messages?limit=30`;
    if (pageIndex > 0 && previousPageData?.messages?.length > 0) {
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
  } = useSWRInfinite(getKey, fetcher, {
    refreshInterval: selectedChatId && isWindowFocused ? 2000 : 0,
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

  // Preselect chat logic
  useEffect(() => {
    if (!selectedChatId && chats.length > 0) {
      setSelectedChatId(chats[0].id);
    }
  }, [chats, selectedChatId]);

  // Read message marking + Optimistic update
  useEffect(() => {
    if (!selectedChatId) {
      setHasNewWhileUp(false);
      setOptimisticMsgs([]);
      return;
    }

    isSwitchingChatRef.current = true;
    shouldAutoScrollRef.current = true;
    setHasNewWhileUp(false);
    setOptimisticMsgs([]);

    // Optimistic unread zeroing
    mutateChats((data: any) => {
      if (!data) return data;
      return {
        ...data,
        chats: data.chats.map((c: any) => c.id === selectedChatId ? { ...c, unread_count: 0 } : c)
      };
    }, false);

    fetch(`/api/chats/${selectedChatId}/read`, { method: "POST" }).then(() => {
      mutateChats();
    });
  }, [selectedChatId, mutateChats]);

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
    if (!selectedChatId || !messages.length) return;
    if (!shouldAutoScrollRef.current) return;

    if (isSwitchingChatRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom("auto");
        isSwitchingChatRef.current = false;
      });
    } else {
      scrollToBottom("smooth");
    }
  }, [messages.length, selectedChatId, hasNewWhileUp]); // Added hasNewWhileUp to deps to fix lint

  return (
    <div className="h-full max-h-full w-full flex flex-col overflow-hidden bg-[#f0f2f5] rounded-[2.5rem] p-3.5 shadow-inner">
      <div className="flex flex-1 min-h-0 gap-3.5 overflow-hidden">
        <div className="w-[320px] min-w-[320px] max-w-[400px] flex-shrink-0 h-full flex flex-col min-h-0">
          <SidebarChats
            chats={chats}
            selectedChatId={selectedChatId}
            loadingChats={loadingChats}
            error={error}
            onRefresh={() => mutateChats()}
            onSelectChat={(chatId) => {
              if (chatId === selectedChatId) return;
              setSelectedChatId(chatId);
            }}
          />
        </div>

        <div className="flex-1 min-w-0 h-full flex flex-col min-h-0">
          <ChatPanel
            selectedChat={selectedChat}
            selectedChatId={selectedChatId}
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
              if (!selectedChatId) return;
              shouldAutoScrollRef.current = true;
              setHasNewWhileUp(false);
              const tempId = "temp-" + Date.now();
              const optimisticMsg: Msg = { id: tempId, direction: "out", text, created_at: new Date().toISOString(), status: "sent" };
              setOptimisticMsgs((prev) => [...prev, optimisticMsg]);
              setTimeout(() => scrollToBottom("smooth"), 50);
              try {
                const res = await fetch("/api/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: selectedChatId, text }), });
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



