"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/components/shared/Toast";

export default function SendBox({
  disabled,
  onSend,
  messages,
}: {
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
  messages?: Array<{ id: string; direction: "in" | "out"; text: string | null }>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const { showToast } = useToast();

  const handleSuggestReply = async () => {
    if (!messages || messages.length === 0) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, tipo_acao: "suggest" })
      });
      const data = await res.json();
      if (data.ok && data.output) {
        setText(data.output);
      } else {
        showToast("Falha ao gerar sugestão de resposta.", "error");
      }
    } catch (err: any) {
      showToast("Erro de conexão com a IA.", "error");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="sticky bottom-0 z-[2] flex shrink-0 gap-2.5 border-t wa-divider bg-white/35 p-3 backdrop-blur-xl">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const msg = text.trim();
            if (!msg || disabled || sending || aiLoading) return;

            setText("");
            setSending(true);
            onSend(msg).finally(() => setSending(false));
          }
        }}
        placeholder={disabled ? "Selecione uma conversa..." : "Digite sua mensagem"}
        disabled={disabled || sending}
        className={`flex-1 rounded-[2rem] border px-3.5 py-3 text-sm outline-none placeholder:text-slate-500 transition-colors ${disabled || aiLoading
          ? "border-white/50 bg-white/50 text-slate-500"
          : "border-white bg-white/80 text-slate-900 focus:border-[#07a0c3]/50 focus:bg-white"
          }`}
      />

      {/* SaaS Intelligence Sparkles Button */}
      <button
        disabled={disabled || sending || aiLoading || !messages || messages.length === 0}
        onClick={handleSuggestReply}
        title="Gerar sugestão de resposta com IA"
        className={`flex items-center justify-center min-w-[48px] h-[48px] rounded-full border border-transparent transition-all ${disabled || sending || aiLoading || !messages || messages.length === 0
          ? "cursor-not-allowed bg-white/50 text-slate-400"
          : "cursor-pointer bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg shadow-purple-500/20 hover:scale-105 hover:shadow-purple-500/40"
          }`}
      >
        {aiLoading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
      </button>

      <button
        disabled={disabled || sending || aiLoading || !text.trim()}
        onClick={() => {
          const msg = text.trim();
          if (!msg) return;

          setText("");
          setSending(true);
          onSend(msg).finally(() => setSending(false));
        }}
        className={`min-w-[110px] rounded-[2rem] border border-transparent px-3.5 py-3 text-sm font-semibold transition-colors ${disabled || sending || aiLoading || !text.trim()
          ? "cursor-not-allowed bg-white/50 text-slate-500"
          : "cursor-pointer text-white bg-[#086788] hover:bg-[#07a0c3]"
          }`}
      >
        {sending ? "Enviando..." : (aiLoading ? "Pensando..." : "Enviar")}
      </button>
    </div>
  );
}
