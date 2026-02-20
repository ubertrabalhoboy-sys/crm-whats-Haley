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
        marginTop: 10,
        borderTop: "1px solid #eee",
        paddingTop: 10,
        display: "flex",
        gap: 8,
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
        style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
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
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #ddd",
          cursor: "pointer",
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
      setHasNewWhileUp(false); // ✅ NOVO
      return;
    }

    // ao abrir chat, a intenção é estar no fim
    shouldAutoScrollRef.current = true;
    setHasNewWhileUp(false); // ✅ NOVO

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

    // garante que o DOM já renderizou a msg antes de rolar
    requestAnimationFrame(() => scrollToBottom("smooth"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedChatId]);

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateColumns: "340px 1fr 320px" }}>
      {/* LEFT */}
      <aside style={{ borderRight: "1px solid #eee", padding: 12, overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Conversas</h2>
          <button
            onClick={loadChats}
            style={{ marginLeft: "auto", padding: "6px 10px", cursor: "pointer" }}
          >
            {loadingChats ? "Carregando..." : "Atualizar"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#fee", border: "1px solid #fbb", padding: 10, marginBottom: 10 }}>
            {error}
          </div>
        )}

        {chats.length === 0 && !loadingChats && (
          <div style={{ color: "#666" }}>Sem conversas ainda. Envie um webhook de teste.</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {chats.map((c) => {
            const active = c.id === selectedChatId;
            const title = c.contacts?.name || c.contacts?.phone || c.wa_chat_id || "Sem nome";
            return (
              <button
                key={c.id}
                onClick={() => setSelectedChatId(c.id)}
                style={{
                  textAlign: "left",
                  border: "1px solid #ddd",
                  background: active ? "#f4f4f4" : "white",
                  padding: 10,
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {title}
                  </div>
                  {!!c.unread_count && c.unread_count > 0 && (
                    <span
                      style={{
                        marginLeft: "auto",
                        background: "#111",
                        color: "white",
                        fontSize: 12,
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {c.unread_count}
                    </span>
                  )}
                </div>
                <div style={{ color: "#555", fontSize: 13, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.last_message || "(sem mensagem)"}
                </div>
                <div style={{ color: "#888", fontSize: 12, marginTop: 6 }}>
                  Status: {c.kanban_status || "Novo"}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* MIDDLE */}
      <main style={{ padding: 12, display: "flex", flexDirection: "column" }}>
        <div style={{ borderBottom: "1px solid #eee", paddingBottom: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 800 }}>
            {selectedChat
              ? selectedChat.contacts?.name || selectedChat.contacts?.phone || selectedChat.wa_chat_id
              : "Selecione uma conversa"}
          </div>
          <div style={{ color: "#777", fontSize: 12 }}>{selectedChat?.wa_chat_id ?? ""}</div>

          {/* ✅ ADICIONADO NO LUGAR CORRETO: logo abaixo do header do chat */}
          {selectedChat?.is_typing && (
            <div style={{ fontSize: 12, color: "#22c55e", marginTop: 4 }}>
              digitando...
            </div>
          )}
        </div>

        <div
          ref={msgsWrapRef}
          onScroll={handleMsgsScroll}
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            position: "relative", // ✅ NOVO (pra ajudar no overlay)
          }}
        >
          {loadingMsgs && <div style={{ color: "#666" }}>Carregando mensagens...</div>}

          {!loadingMsgs && messages.length === 0 && selectedChatId && (
            <div style={{ color: "#666" }}>Sem mensagens nesse chat.</div>
          )}

          {messages.map((m) => {
            const isIn = m.direction === "in";
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: isIn ? "flex-start" : "flex-end",
                  maxWidth: "70%",
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: "8px 10px",
                  background: isIn ? "white" : "#f4f4f4",
                }}
              >
                <div style={{ whiteSpace: "pre-wrap" }}>{m.text || "(sem texto)"}</div>
                <div style={{ marginTop: 6, fontSize: 11, color: "#777" }}>
                  {new Date(m.created_at).toLocaleString("pt-BR")}
                </div>
              </div>
            );
          })}

          {/* ✅ NOVO: botão "Novas mensagens" (sticky dentro do scroll) */}
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
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid #ddd",
                  background: "white",
                  cursor: "pointer",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                  fontWeight: 700,
                }}
              >
                ⬇️ Novas mensagens
              </button>
            </div>
          )}

          {/* âncora do fim */}
          <div ref={bottomRef} />
        </div>

        <SendBox
          disabled={!selectedChatId}
          onSend={async (text) => {
            if (!selectedChatId) return;

            // ao enviar, a intenção é ficar no fim
            shouldAutoScrollRef.current = true;
            setHasNewWhileUp(false); // ✅ NOVO

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

      {/* RIGHT */}
      <aside style={{ borderLeft: "1px solid #eee", padding: 12, overflow: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Detalhes</h3>
        {!selectedChat && <div style={{ color: "#666" }}>Selecione uma conversa.</div>}
        {selectedChat && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
              <div style={{ fontWeight: 700 }}>Contato</div>
              <div style={{ marginTop: 6, color: "#444" }}>Nome: {selectedChat.contacts?.name || "-"}</div>
              <div style={{ color: "#444" }}>Telefone: {selectedChat.contacts?.phone || "-"}</div>
            </div>

            <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
              <div style={{ fontWeight: 700 }}>Kanban</div>
              <div style={{ marginTop: 6, color: "#444" }}>
                Status atual: {selectedChat.kanban_status || "Novo"}
              </div>
              <div style={{ marginTop: 6, color: "#777", fontSize: 12 }}>
                Próximo passo: dropdown pra mudar status e disparar automação.
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}