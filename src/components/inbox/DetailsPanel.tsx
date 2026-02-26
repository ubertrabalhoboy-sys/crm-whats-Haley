"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Loader2, FileText, Phone, User, ChevronDown, ArrowRightLeft } from "lucide-react";

type Chat = {
  id: string;
  wa_chat_id: string | null;
  kanban_status: string | null;
  contacts?: { phone: string | null; name: string | null } | null;
};

type Msg = {
  id: string;
  direction: "in" | "out";
  text: string | null;
};

type Stage = {
  id: string;
  name: string;
};

// ── Avatar com iniciais ──
function ContactAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || "")
    .join("");

  return (
    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#086788] to-[#07a0c3] flex items-center justify-center text-white text-xl font-black tracking-tight shadow-lg shadow-[#086788]/20 ring-4 ring-white/80">
      {initials || "?"}
    </div>
  );
}

// ── Formatar telefone ──
function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  const clean = phone.includes("@") ? phone.split("@")[0] : phone;
  if (clean.length === 13) {
    // Ex: 5511999999999 → +55 (11) 99999-9999
    return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  }
  return clean;
}

export default function DetailsPanel({
  selectedChat,
  messages,
}: {
  selectedChat: Chat | null;
  messages?: Msg[];
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Kanban stages + dropdown
  const [stages, setStages] = useState<Stage[]>([]);
  const [currentStage, setCurrentStage] = useState<string>("");
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);
  const [stageSuccess, setStageSuccess] = useState(false);

  // Fetch stages once
  useEffect(() => {
    fetch("/api/kanban-stages")
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.stages) setStages(data.stages);
      })
      .catch(() => { /* silent */ });
  }, []);

  // Sync current stage when selected chat changes
  useEffect(() => {
    if (selectedChat?.kanban_status) {
      setCurrentStage(selectedChat.kanban_status);
    } else {
      setCurrentStage("");
    }
    setSummary(null);
    setStageSuccess(false);
  }, [selectedChat?.id, selectedChat?.kanban_status]);

  const handleStageChange = useCallback(async (newStageName: string) => {
    if (!selectedChat?.id || !newStageName || newStageName === currentStage) return;

    const matchedStage = stages.find(s => s.name === newStageName);
    if (!matchedStage) return;

    // Optimistic UI
    const previousStage = currentStage;
    setCurrentStage(newStageName);
    setIsUpdatingStage(true);
    setStageSuccess(false);

    try {
      const res = await fetch(`/api/chats/${selectedChat.id}/kanban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: matchedStage.id, stageName: matchedStage.name }),
      });
      const data = await res.json();
      if (!data.ok) {
        // Revert on failure
        setCurrentStage(previousStage);
        console.error("Erro ao atualizar estágio:", data.error);
      } else {
        setStageSuccess(true);
        setTimeout(() => setStageSuccess(false), 2000);
      }
    } catch {
      setCurrentStage(previousStage);
      console.error("Erro de conexão ao atualizar estágio");
    } finally {
      setIsUpdatingStage(false);
    }
  }, [selectedChat?.id, currentStage, stages]);

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
        console.error("Falha ao resumir:", data.error);
      }
    } catch (err: any) {
      console.error("Erro de conexão ao resumir:", err.message);
    } finally {
      setIsSummarizing(false);
    }
  };

  const contactName = selectedChat?.contacts?.name || "Sem nome";
  const contactPhone = selectedChat?.contacts?.phone;

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

            {/* ── Card do Contato (Premium) ── */}
            <div className="rounded-[1.25rem] bg-white/70 backdrop-blur-md border border-white/80 p-5 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <ContactAvatar name={contactName} />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-black text-slate-800 truncate leading-tight">
                    {contactName}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Phone size={12} className="text-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-slate-500 tabular-nums truncate">
                      {formatPhone(contactPhone)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {selectedChat.wa_chat_id && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[9px] font-black uppercase tracking-widest text-emerald-700">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /></svg>
                    WhatsApp
                  </span>
                )}
                {currentStage && (
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border"
                    style={{
                      backgroundColor: stageSuccess ? '#ecfdf5' : '#f0f9ff',
                      borderColor: stageSuccess ? '#86efac' : '#bae6fd',
                      color: stageSuccess ? '#15803d' : '#0369a1',
                    }}
                  >
                    {stageSuccess ? '✓ Salvo' : currentStage}
                  </span>
                )}
              </div>
            </div>

            {/* ── Card do Funil (Kanban Dropdown) ── */}
            <div className="rounded-[1.25rem] bg-white/70 backdrop-blur-md border border-white/80 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <ArrowRightLeft size={14} className="text-[#086788]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-[#086788]">
                  Estágio no Funil
                </span>
              </div>

              {stages.length > 0 ? (
                <div className="relative">
                  <select
                    value={currentStage}
                    onChange={(e) => handleStageChange(e.target.value)}
                    disabled={isUpdatingStage}
                    className={`w-full appearance-none rounded-xl border px-4 py-3 pr-10 text-sm font-bold outline-none transition-all cursor-pointer ${isUpdatingStage
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : stageSuccess
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          : 'bg-white/80 border-slate-200 text-slate-700 hover:border-[#07a0c3] focus:border-[#07a0c3] focus:ring-2 focus:ring-[#07a0c3]/20'
                      }`}
                  >
                    {!currentStage && <option value="">Selecione...</option>}
                    {stages.map(stage => (
                      <option key={stage.id} value={stage.name}>
                        {stage.name}
                      </option>
                    ))}
                  </select>

                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    {isUpdatingStage ? (
                      <Loader2 size={14} className="text-amber-500 animate-spin" />
                    ) : (
                      <ChevronDown size={14} className="text-slate-400" />
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 font-bold">
                  Nenhum estágio configurado no Kanban.
                </p>
              )}

              <p className="mt-2 text-[10px] text-slate-400 font-bold leading-relaxed">
                Alterar o estágio dispara automaticamente o webhook do Fiqon com a tag configurada.
              </p>
            </div>

            {/* ── Card de IA ── */}
            <div className="mt-1 rounded-[1.25rem] bg-gradient-to-br from-[#086788] to-[#07a0c3] p-5 text-white shadow-lg relative overflow-hidden group shrink-0">
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
