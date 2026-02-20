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
        onKeyDown={async (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const msg = text.trim();
            if (!msg || disabled || sending) return;

            setSending(true);
            try {
              await onSend(msg);
              setText("");
            } finally {
              setSending(false);
            }
          }
        }}
        placeholder={disabled ? "Selecione uma conversa..." : "Digite sua mensagem"}
        disabled={disabled || sending}
        style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
      />
      <button
        disabled={disabled || sending || !text.trim()}
        onClick={async () => {
          const msg = text.trim();
          if (!msg) return;
          setSending(true);
          try {
            await onSend(msg);
            setText("");
          } finally {
            setSending(false);
          }
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

  // ✅ (PASSO 2) refs logo depois dos useState
  const msgsAbortRef = useRef<AbortController | null>(null);
  const msgsInFlightRef = useRef(false);

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) ?? null,
    [chats, selectedChatId]
  );

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

  // ✅ (PASSO 3) Substituído: loadMessages com AbortController + in-flight + silent
  async function loadMessages(chatId: string, opts?: { silent?: boolean }) {
    // ✅ evita duas requisições ao mesmo tempo
    if (msgsInFlightRef.current) return;
    msgsInFlightRef.current = true;

    // ✅ cancela a anterior (se tiver)
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
      setMessages(json.messages || []);
    } catch (e: any) {
      // ignora abort (isso é esperado quando cancela)
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
    if (selectedChatId) loadMessages(selectedChatId);
    else setMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId]);

  // ✅ Polling ajustado: silent no intervalo (sem piscar / sem enroscar)
  useEffect(() => {
    if (!selectedChatId) return;

    // carrega na hora (normal)
    loadMessages(selectedChatId);
    loadChats();

    const timer = setInterval(() => {
      // ✅ atualiza mensagens sem ficar “carregando...”
      loadMessages(selectedChatId, { silent: true });
      loadChats();
    }, 2000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId]);

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
                <div
                  style={{
                    color: "#555",
                    fontSize: 13,
                    marginTop: 6,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
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
        </div>

        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
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
        </div>

        <SendBox
          disabled={!selectedChatId}
          onSend={async (text) => {
            if (!selectedChatId) return;

            // ✅ 1) Mostra a mensagem na tela imediatamente (modo otimista)
            const tempId = "temp-" + Date.now();

            setMessages((prev) => [
              ...prev,
              {
                id: tempId,
                direction: "out",
                text,
                created_at: new Date().toISOString(),
              },
            ]);

            setError(null);

            try {
              // ✅ 2) Envia para API (continua funcionando igual)
              const res = await fetch("/api/messages/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: selectedChatId, text }),
              });

              const json = await res.json();
              if (!json.ok) {
                setError(json.error || "Falha ao enviar");
              }
            } catch (err) {
              setError("Erro ao enviar mensagem");
            }

            // ✅ 3) Depois sincroniza com banco
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