"use client";

import { useState } from "react";
import { Sparkles, Loader2, FileText } from "lucide-react";

type Chat = {
  wa_chat_id: string | null;
  kanban_status: string | null;
  contacts?: { phone: string | null; name: string | null } | null;
};

type Msg = {
  id: string;
  direction: "in" | "out";
  text: string | null;
};

export default function DetailsPanel({
  selectedChat,
  messages,
}: {
  selectedChat: Chat | null;
  messages?: Msg[];
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const handleSummarizeChat = async () => {
    if (!messages || messages.length === 0) return;
    setIsSummarizing(true);
    setSummary(null);
    try {
      const res = await fetch("/api/ai/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, tipo_acao: "summarize" })
      });
      const data = await res.json();
      if (data.ok && data.output) {
        setSummary(data.output);
      } else {
        alert("Falha ao resumir: " + (data.error || "Erro desconhecido"));
      }
    } catch (err: any) {
      alert("Erro de conexão ao resumir: " + err.message);
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <aside className="hidden lg:flex min-h-0 min-w-0 h-[calc(100vh-250px)] flex-col overflow-hidden rounded-[2rem] bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5">
      <div className="sticky top-0 z-[2] border-b wa-divider bg-white/35 p-3 backdrop-blur-xl">
        <div className="text-sm font-semibold text-slate-900">Detalhes</div>
        <div className="text-xs text-slate-600">Perfil e Kanban</div>
      </div>

      <div className="min-h-0 h-full overflow-y-auto p-3 custom-scroll">
        {!selectedChat && <div className="text-slate-600">Selecione uma conversa.</div>}

        {selectedChat && (
          <div className="flex flex-col gap-3">
            <div className="wa-card rounded-[14px] p-3">
              <div className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#07a0c3]">Contato</div>
              <div className="text-[13px] text-slate-700">
                <div>Nome: {selectedChat.contacts?.name || "-"}</div>
                <div>Telefone: {selectedChat.contacts?.phone?.includes("@") ? selectedChat.contacts.phone.split("@")[0] : selectedChat.contacts?.phone || "-"}</div>
              </div>
            </div>

            <div className="wa-card rounded-[14px] p-3">
              <div className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#07a0c3]">Kanban</div>
              <div className="text-[13px] text-slate-700">
                <div>Status atual: {selectedChat.kanban_status || "Novo"}</div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Próximo passo: dropdown pra mudar status e disparar automação.
              </div>
            </div>

            <div className="mt-4 rounded-[14px] bg-gradient-to-br from-[#086788] to-[#07a0c3] p-4 text-white shadow-lg relative overflow-hidden group shrink-0">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -mr-8 -mt-8" />
              <div className="mb-3 flex items-center justify-between relative z-10">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/90 drop-shadow-sm flex items-center gap-1.5">
                  <Sparkles size={14} className="text-[#0fffc2]" /> SaaS Intelligence
                </span>
              </div>

              <div className="relative z-10">
                {summary ? (
                  <div className="text-sm text-indigo-50 leading-relaxed whitespace-pre-wrap font-medium pb-3 border-b border-white/20 mb-3">
                    {summary}
                  </div>
                ) : (
                  <p className="text-xs text-white/80 mb-4">
                    Gere um resumo inteligente desta conversa em tópicos através da IA.
                  </p>
                )}

                <button
                  onClick={handleSummarizeChat}
                  disabled={isSummarizing || !messages || messages.length === 0}
                  className="w-full py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/30 transition-all font-semibold text-xs flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSummarizing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Analisando Contexto...
                    </>
                  ) : (
                    <>
                      <FileText size={14} /> {summary ? "Gerar Novo Resumo" : "Resumir Conversa"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
