"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Chat = {
  id: string;
  wa_chat_id: string | null;
  kanban_status: string | null;
  last_message: string | null;
  unread_count: number | null;
  updated_at: string | null;
  contacts?: { phone: string | null; name: string | null } | null;

  // ✅ NOVO (pra não quebrar TS ao usar selectedChat?.is_typing)
  is_typing?: boolean | null;
};

type Msg = {
  id: string;
  direction: "in" | "out";
  text: string | null;
  created_at: string;
  status?: "sent" | "delivered" | "read";
};

function SendBox({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  return (
    <div
      style={{
        padding: 12,
        borderTop: "1px solid rgba(15, 23, 42, 0.08)",
        display: "flex",
        gap: 10,
        background: "white",
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const msg = text.trim();
            if (!msg || disabled || sending) return;

            setText("");
            setSending(true);
            onSend(msg).finally(() => setSending(false));
          }
        }}
        placeholder={disabled ? "Selecione uma conversa..." : "Digite sua mensagem"}
        disabled={disabled || sending}
        style={{
          flex: 1,
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid rgba(15, 23, 42, 0.12)",
          outline: "none",
          background: disabled ? "#f8fafc" : "white",
        }}
      />
      <button
        disabled={disabled || sending || !text.trim()}
        onClick={() => {
          const msg = text.trim();
          if (!msg) return;

          setText("");
          setSending(true);
          onSend(msg).finally(() => setSending(false));
        }}
        style={{
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid rgba(15, 23, 42, 0.12)",
          cursor: disabled || sending ? "not-allowed" : "pointer",
          background: disabled || sending ? "#e5e7eb" : "#111827",
          color: disabled || sending ? "#6b7280" : "white",
          fontWeight: 700,
          minWidth: 110,
        }}
      >
        {sending ? "Enviando..." : "Enviar"}
      </button>
    </div>
  );
}

export default function InboxPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ NOVO: botão "Novas mensagens"
  const [hasNewWhileUp, setHasNewWhileUp] = useState(false);

  // ✅ refs da busca de mensagens (abort + in-flight)
  const msgsAbortRef = useRef<AbortController | null>(null);
  const msgsInFlightRef = useRef(false);

  // ✅ refs do scroll inteligente
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

    // “perto do final” = auto-scroll habilitado
    const threshold = 120; // px
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= threshold;

    // ✅ NOVO: se voltou pro fim, some com o botão
    if (shouldAutoScrollRef.current && hasNewWhileUp) {
      setHasNewWhileUp(false);
    }
  }

  // ✅ ATUALIZADO (com cache-bust + no-store + no-cache)
  async function loadChats() {
    setLoadingChats(true);
    setError(null);
    try {
      const res = await fetch(`/api/chats?t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Falha ao buscar chats");
      setChats(json.chats || []);
      if (!selectedChatId && json.chats?.[0]?.id) setSelectedChatId(json.chats[0].id);
    } catch (e: any) {
      setError(e?.message ?? "Erro");
    } finally {
      setLoadingChats(false);
    }
  }

  // ✅ loadMessages com AbortController + in-flight + silent
  async function loadMessages(chatId: string, opts?: { silent?: boolean }) {
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

      // ✅ merge com mensagens temp- (pra não piscar/sumir)
      setMessages((prev) => {
        const serverMsgs: Msg[] = json.messages || [];
        const tempMsgs = prev.filter((m) => String(m.id).startsWith("temp-"));

        const stillPending = tempMsgs.filter((t) => {
          return !serverMsgs.some(
            (s) => s.direction === t.direction && (s.text || "") === (t.text || "")
          );
        });

        const merged = [...serverMsgs, ...stillPending];
        merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        // ✅ NOVO: se chegou msg nova enquanto usuário está "lá em cima", mostra botão (sem puxar)
        const prevMax = prev.length
          ? Math.max(...prev.map((m) => new Date(m.created_at).getTime()))
          : 0;
        const mergedMax = merged.length
          ? Math.max(...merged.map((m) => new Date(m.created_at).getTime()))
          : 0;

        if (mergedMax > prevMax && !shouldAutoScrollRef.current) {
          setHasNewWhileUp(true);
        }

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

  // ✅ ao trocar chat: carrega msgs + marca como lido
  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      setHasNewWhileUp(false);
      return;
    }

    shouldAutoScrollRef.current = true;
    setHasNewWhileUp(false);

    loadMessages(selectedChatId);

    fetch(`/api/chats/${selectedChatId}/read`, { method: "POST" }).then(() => {
      loadChats();
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId]);

  // ✅ polling somente mensagens
  useEffect(() => {
    if (!selectedChatId) return;

    const timer = setInterval(() => {
      loadMessages(selectedChatId, { silent: true });
    }, 2000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId]);

  // ✅ SCROLL INTELIGENTE: quando messages muda, só desce se usuário estiver no fim
  useEffect(() => {
    if (!selectedChatId) return;
    if (!shouldAutoScrollRef.current) return;

    requestAnimationFrame(() => scrollToBottom("smooth"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedChatId]);

  const pageBg = "linear-gradient(180deg, #f6f7fb 0%, #eef2ff 100%)";

  return (
    <div style={{ height: "100vh", background: pageBg, padding: 14 }}>
      <div
        style={{
          height: "calc(100vh - 28px)",
          display: "grid",
          gridTemplateColumns: "360px 1fr 340px",
          gap: 14,
        }}
      >
        {/* LEFT - Conversas */}
        <aside
          style={{
            border: "1px solid rgba(15, 23, 42, 0.10)",
            borderRadius: 16,
            background: "white",
            overflow: "hidden",
            boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {/* Header fixo */}
          <div
            style={{
              padding: 12,
              borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              position: "sticky",
              top: 0,
              background: "white",
              zIndex: 2,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 0.2 }}>Conversas</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Inbox WhatsApp</div>
            </div>

            <button
              onClick={loadChats}
              style={{
                marginLeft: "auto",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(15, 23, 42, 0.12)",
                background: "white",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {loadingChats ? "Carregando..." : "Atualizar"}
            </button>
          </div>

          {/* Conteúdo com scroll */}
          <div style={{ padding: 12, overflow: "auto", minHeight: 0 }}>
            {error && (
              <div
                style={{
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  color: "#9f1239",
                  padding: 10,
                  borderRadius: 12,
                  marginBottom: 10,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {error}
              </div>
            )}

            {chats.length === 0 && !loadingChats && (
              <div style={{ color: "#64748b", fontSize: 13 }}>
                Sem conversas ainda. Envie um webhook de teste.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {chats.map((c) => {
                const active = c.id === selectedChatId;
                const title = c.contacts?.name || c.contacts?.phone || c.wa_chat_id || "Sem nome";

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedChatId(c.id)}
                    style={{
                      textAlign: "left",
                      border: active
                        ? "1px solid rgba(99, 102, 241, 0.45)"
                        : "1px solid rgba(15, 23, 42, 0.10)",
                      background: active ? "rgba(99, 102, 241, 0.10)" : "white",
                      padding: 12,
                      borderRadius: 14,
                      cursor: "pointer",
                      boxShadow: active ? "0 10px 24px rgba(99,102,241,0.12)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 900,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: 14,
                          }}
                        >
                          {title}
                        </div>
                        <div
                          style={{
                            color: "#64748b",
                            fontSize: 12,
                            marginTop: 4,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {c.last_message || "(sem mensagem)"}
                        </div>
                      </div>

                      {!!c.unread_count && c.unread_count > 0 && (
                        <span
                          style={{
                            background: "#111827",
                            color: "white",
                            fontSize: 12,
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontWeight: 900,
                          }}
                        >
                          {c.unread_count}
                        </span>
                      )}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 12,
                          padding: "4px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(15, 23, 42, 0.10)",
                          color: "#334155",
                          background: "#f8fafc",
                          fontWeight: 700,
                        }}
                      >
                        {c.kanban_status || "Novo"}
                      </span>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>
                        {c.updated_at ? new Date(c.updated_at).toLocaleString("pt-BR") : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* MIDDLE - Chat */}
        <main
          style={{
            border: "1px solid rgba(15, 23, 42, 0.10)",
            borderRadius: 16,
            background: "white",
            overflow: "hidden",
            boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {/* Header fixo */}
          <div
            style={{
              padding: 12,
              borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
              position: "sticky",
              top: 0,
              background: "white",
              zIndex: 2,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 950, fontSize: 14 }}>
                  {selectedChat
                    ? selectedChat.contacts?.name ||
                      selectedChat.contacts?.phone ||
                      selectedChat.wa_chat_id
                    : "Selecione uma conversa"}
                </div>
                <div style={{ color: "#64748b", fontSize: 12 }}>
                  {selectedChat?.wa_chat_id ?? ""}
                </div>
              </div>

              <span
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(15, 23, 42, 0.10)",
                  background: "#f8fafc",
                  color: "#334155",
                  fontWeight: 800,
                }}
              >
                {selectedChat?.kanban_status || "Novo"}
              </span>
            </div>

            {selectedChat?.is_typing && (
              <div style={{ fontSize: 12, color: "#22c55e", marginTop: 6, fontWeight: 800 }}>
                digitando...
              </div>
            )}
          </div>

          {/* Mensagens com scroll */}
          <div
            ref={msgsWrapRef}
            onScroll={handleMsgsScroll}
            style={{
              flex: 1,
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: 14,
              minHeight: 0,
              background:
                "radial-gradient(1200px 400px at 50% 0%, rgba(99,102,241,0.12) 0%, rgba(255,255,255,1) 45%)",
              position: "relative",
            }}
          >
            {loadingMsgs && <div style={{ color: "#64748b" }}>Carregando mensagens...</div>}

            {!loadingMsgs && messages.length === 0 && selectedChatId && (
              <div style={{ color: "#64748b" }}>Sem mensagens nesse chat.</div>
            )}

            {messages.map((m) => {
              const isIn = m.direction === "in";

              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isIn ? "flex-start" : "flex-end",
                    maxWidth: "72%",
                    border: "1px solid rgba(15, 23, 42, 0.10)",
                    borderRadius: 14,
                    padding: "10px 12px",
                    background: isIn ? "white" : "rgba(99, 102, 241, 0.10)",
                    boxShadow: "0 8px 20px rgba(0,0,0,0.04)",
                  }}
                >
                  {/* ✅ TEXTO (tava faltando no seu map) */}
                  <div style={{ whiteSpace: "pre-wrap", color: "#0f172a", fontSize: 14 }}>
                    {m.text || "(sem texto)"}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      color: "#64748b",
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span>{new Date(m.created_at).toLocaleString("pt-BR")}</span>

                    {m.direction === "out" && (
                      <span style={{ fontWeight: 900 }}>
                        {m.status === "sent" && "✓"}
                        {m.status === "delivered" && "✓✓"}
                        {m.status === "read" && <span style={{ color: "#3b82f6" }}>✓✓</span>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* ✅ botão "Novas mensagens" (sticky dentro do scroll) */}
            {hasNewWhileUp && (
              <div
                style={{
                  position: "sticky",
                  bottom: 12,
                  display: "flex",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <button
                  onClick={() => {
                    setHasNewWhileUp(false);
                    shouldAutoScrollRef.current = true;
                    requestAnimationFrame(() => scrollToBottom("smooth"));
                  }}
                  style={{
                    pointerEvents: "auto",
                    padding: "10px 14px",
                    borderRadius: 999,
                    border: "1px solid rgba(15, 23, 42, 0.12)",
                    background: "white",
                    cursor: "pointer",
                    boxShadow: "0 14px 30px rgba(0,0,0,0.10)",
                    fontWeight: 900,
                  }}
                >
                  ⬇️ Novas mensagens
                </button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <SendBox
            disabled={!selectedChatId}
            onSend={async (text) => {
              if (!selectedChatId) return;

              shouldAutoScrollRef.current = true;
              setHasNewWhileUp(false);

              const tempId = "temp-" + Date.now();
              setMessages((prev) => [
                ...prev,
                { id: tempId, direction: "out", text, created_at: new Date().toISOString() },
              ]);

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
              loadChats();
            }}
          />
        </main>

        {/* RIGHT - Detalhes */}
        <aside
          style={{
            border: "1px solid rgba(15, 23, 42, 0.10)",
            borderRadius: 16,
            background: "white",
            overflow: "hidden",
            boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {/* Header fixo */}
          <div
            style={{
              padding: 12,
              borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
              position: "sticky",
              top: 0,
              background: "white",
              zIndex: 2,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 950 }}>Detalhes</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Perfil e Kanban</div>
          </div>

          {/* Conteúdo scroll */}
          <div style={{ padding: 12, overflow: "auto", minHeight: 0 }}>
            {!selectedChat && <div style={{ color: "#64748b" }}>Selecione uma conversa.</div>}

            {selectedChat && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    border: "1px solid rgba(15, 23, 42, 0.10)",
                    borderRadius: 14,
                    padding: 12,
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ fontWeight: 950, marginBottom: 8 }}>Contato</div>
                  <div style={{ color: "#334155", fontSize: 13 }}>
                    <div>Nome: {selectedChat.contacts?.name || "-"}</div>
                    <div>Telefone: {selectedChat.contacts?.phone || "-"}</div>
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid rgba(15, 23, 42, 0.10)",
                    borderRadius: 14,
                    padding: 12,
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ fontWeight: 950, marginBottom: 8 }}>Kanban</div>
                  <div style={{ color: "#334155", fontSize: 13 }}>
                    <div>Status atual: {selectedChat.kanban_status || "Novo"}</div>
                  </div>
                  <div style={{ marginTop: 8, color: "#64748b", fontSize: 12 }}>
                    Próximo passo: dropdown pra mudar status e disparar automação.
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}