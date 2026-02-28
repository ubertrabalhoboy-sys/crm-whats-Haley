"use client";

import { useState } from "react";
import { Sparkles, Loader2, X, Check, RotateCw } from "lucide-react";
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
  const [suggestion, setSuggestion] = useState<string | null>(null);
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
        setSuggestion(data.output);
      } else {
        showToast("Falha ao gerar sugestão de resposta.", "error");
      }
    } catch (err: any) {
      showToast("Erro de conexão com a IA.", "error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplySuggestion = () => {
    if (suggestion) {
      setText(suggestion);
      setSuggestion(null);
    }
  };

  const handleDiscardSuggestion = () => {
    setSuggestion(null);
  };

  return (
    <div className="relative border-t wa-divider bg-white/35 backdrop-blur-xl">
      {/* AI Suggestion Card */}
      {suggestion && (
        <div className="absolute bottom-full left-0 right-0 mb-3 px-4 z-[10] transition-all duration-300">
          <div className="bg-white/90 backdrop-blur-2xl border border-white/60 rounded-3xl p-4 shadow-2xl shadow-indigo-500/15 flex flex-col gap-3 max-w-[500px] mx-auto animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between gap-2 border-b border-indigo-50 pb-2">
              <div className="flex items-center gap-2 text-indigo-600 font-bold text-[10px] uppercase tracking-widest">
                <Sparkles size={14} className="fill-indigo-500/20" />
                Sugestão da Inteligência AI
              </div>
              <button
                onClick={handleDiscardSuggestion}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                title="Descartar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-[13px] text-slate-800 leading-relaxed italic max-h-[120px] overflow-y-auto px-1 scrollbar-thin scrollbar-thumb-indigo-100">
              &quot;{suggestion}&quot;
            </div>

            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={handleApplySuggestion}
                className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl py-2.5 text-xs font-bold shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-transform active:scale-95"
              >
                <Check size={14} />
                Usar esta resposta
              </button>

              <button
                onClick={handleSuggestReply}
                disabled={aiLoading}
                className="p-2.5 bg-white/50 border border-white rounded-2xl text-indigo-600 hover:text-indigo-800 hover:bg-white transition-all disabled:opacity-50 shadow-sm"
                title="Gerar outra opção"
              >
                {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex shrink-0 gap-2.5 p-3">
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
    </div>
  );
}

