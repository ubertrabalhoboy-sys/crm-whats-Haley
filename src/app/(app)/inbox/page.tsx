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

  // SWR for Chats list (Revalidates automatically on window focus, reconnect, etc.)
  const {
    data: chatsData,
    error: chatsError,
    mutate: mutateChats,
    isValidating: isValidatingChats,
  } = useSWR<{ ok: boolean; chats: Chat[] }>(`/api/chats`, fetcher, {
    refreshInterval: 5000, // Replaces our manual setInterval polling safely
    revalidateOnFocus: true,
  });

  const chats = chatsData?.chats || [];
  const loadingChats = !chatsData && !chatsError;
  const error = chatsError?.message || null;

  // SWR Infinite for Messages
  const getKey = (pageIndex: number, previousPageData: any) => {
    if (!selectedChatId) return null;
    if (previousPageData && !previousPageData.messages?.length) return null; // Reached the end

    // Default limit + Cursor targeting
    let url = `/api/chats/${selectedChatId}/messages?limit=30`;

    // If it's not the first page, get the oldest message's created_at to use as a cursor
    if (pageIndex > 0 && previousPageData?.messages?.length > 0) {
      // Since our API now returns newest first, the oldest is at the end of the array (if we didn't reverse it)
      // Actually, since the API does reverse it before returning, the oldest message in previousPageData is at index 0
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
    refreshInterval: selectedChatId ? 3000 : 0, // Fallback safe polling
    revalidateFirstPage: false // Only background poll first page
  });

  // Flatten and merge messages
  const messages = useMemo(() => {
    if (!msgsPages) return optimisticMsgs;

    // msgsPages is an array of API responses.
    // Each response has { messages: [...] } ordered oldest->newest.
    // However, because we get pages moving backwards in time (page 0 = newest 30, page 1 = previous 30, etc.),
    // flattening them directly would put newest page first, then older page.
    // We want the final array to be globally oldest->newest.

    const allFetched = msgsPages
      .map(page => page.messages || [])
      .reverse() // Reverse the *pages* order so oldest page comes first
      .flat();

    // Add optimistic logic
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

  // Preselect chat logic
  useEffect(() => {
    if (!selectedChatId && chats.length > 0) {
      setSelectedChatId(chats[0].id);
    }
  }, [chats, selectedChatId]);

  // Read message marking
  useEffect(() => {
    if (!selectedChatId) {
      setHasNewWhileUp(false);
      setOptimisticMsgs([]);
      return;
    }
    shouldAutoScrollRef.current = true;
    setHasNewWhileUp(false);
    setOptimisticMsgs([]);

    fetch(`/api/chats/${selectedChatId}/read`, { method: "POST" }).then(() => {
      mutateChats();
    });
  }, [selectedChatId, mutateChats]);

  // Infinite Scroll Observer Implementation
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const target = entries[0];
    if (target.isIntersecting && !isReachingEnd && !loadingMsgs) {
      // Save current scroll height to restore position after loading older messages
      if (msgsWrapRef.current) {
        lastScrollHeightRef.current = msgsWrapRef.current.scrollHeight;
        shouldAutoScrollRef.current = false; // Prevent jumping to bottom
      }
      setSize(size + 1);
    }
  }, [isReachingEnd, loadingMsgs, size, setSize]);

  useEffect(() => {
    const option = {
      root: msgsWrapRef.current,
      rootMargin: "200px",
      threshold: 0
    };
    const observer = new IntersectionObserver(handleObserver, option);
    if (topObserverRef.current) observer.observe(topObserverRef.current);
    return () => observer.disconnect();
  }, [handleObserver]);

  // Adjust scroll after loading older messages
  useEffect(() => {
    if (msgsWrapRef.current && lastScrollHeightRef.current > 0 && !shouldAutoScrollRef.current) {
      const el = msgsWrapRef.current;
      const heightDiff = el.scrollHeight - lastScrollHeightRef.current;
      if (heightDiff > 0) {
        el.scrollTop += heightDiff;
        lastScrollHeightRef.current = 0; // Reset
      }
    }
  }, [messages.length]);

  useEffect(() => {
    if (!selectedChatId) return;
    if (!shouldAutoScrollRef.current) return;

    requestAnimationFrame(() => scrollToBottom("auto")); // use swift non-smooth scroll for initial load
  }, [messages.length > 0, selectedChatId]); // Only trigger auto jump on first load of chat or direct send



  return (
    <div className="h-full max-h-full w-full flex flex-col overflow-hidden bg-[#f0f2f5] rounded-[2.5rem] p-3.5 shadow-inner">
      <div className="flex flex-1 min-h-0 gap-3.5 overflow-hidden">
        <div className="w-[320px] min-w-[320px] max-w-[400px] flex-shrink-0 h-full flex flex-col min-h-0">
          <SidebarChats chats={chats} selectedChatId={selectedChatId} loadingChats={loadingChats} error={error} onRefresh={() => mutateChats()} onSelectChat={(chatId) => { if (chatId === selectedChatId) return; setSelectedChatId(chatId); }} />
        </div>

        <div className="flex-1 min-w-0 h-full flex flex-col min-h-0">
          <ChatPanel selectedChat={selectedChat} selectedChatId={selectedChatId} messages={messages} loadingMsgs={loadingMsgs || isValidatingMsgs} hasNewWhileUp={hasNewWhileUp} msgsWrapRef={msgsWrapRef} bottomRef={bottomRef} topObserverRef={topObserverRef} isReachingEnd={isReachingEnd} onMsgsScroll={handleMsgsScroll} onJumpToLatest={() => { setHasNewWhileUp(false); shouldAutoScrollRef.current = true; requestAnimationFrame(() => scrollToBottom("smooth")); }} onSend={async (text) => { if (!selectedChatId) return; shouldAutoScrollRef.current = true; setHasNewWhileUp(false); const tempId = "temp-" + Date.now(); const optimisticMsg: Msg = { id: tempId, direction: "out", text, created_at: new Date().toISOString(), status: "sent" }; setOptimisticMsgs((prev) => [...prev, optimisticMsg]); setTimeout(() => scrollToBottom("smooth"), 50); try { const res = await fetch("/api/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: selectedChatId, text }), }); const json = await res.json(); if (!json.ok) console.error("Falha ao enviar via API"); } catch (err) { console.error("Erro ao enviar mensagem", err); } mutateMsgs(); mutateChats(); }} />
        </div>

        <div className="hidden xl:flex w-[360px] flex-shrink-0 h-full flex flex-col min-h-0">
          <DetailsPanel selectedChat={selectedChat} />
        </div>
      </div>
    </div>
  );
}


