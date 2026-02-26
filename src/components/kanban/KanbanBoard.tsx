"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, User, Pencil, Check, X, Bot, Save, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import useSWR from "swr";

type Stage = {
    id: string;
    name: string;
};

type Chat = {
    id: string;
    wa_chat_id: string | null;
    kanban_status: string | null;
    updated_at: string | null;
    last_message?: string | null;
    contacts?: { phone: string | null; name: string | null } | null;
};

type Automation = {
    id: string;
    stage_id: string;
    restaurant_id: string;
    trigger: string | null;
    enabled: boolean;
};

function formatDate(value: string | null) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(date);
}

function getChatName(chat: Chat) {
    const name = chat.contacts?.name?.trim();
    const phone = chat.contacts?.phone?.trim();
    const waId = chat.wa_chat_id?.trim();

    const rawTitle = name || phone || waId || "Sem nome";
    return rawTitle.includes("@") ? rawTitle.split("@")[0] : rawTitle;
}

function getChatPhone(chat: Chat) {
    const phone = chat.contacts?.phone || chat.wa_chat_id || "Sem número";
    return phone.includes("@") ? phone.split("@")[0] : phone;
}

export default function KanbanBoard({
    stageList,
    chatList,
    restaurantId,
}: {
    stageList: Stage[];
    chatList: Chat[];
    restaurantId: string;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState("Vendas"); // "Vendas" ou "Automacao"

    // Local state for optimistic updates during rename
    const [stages, setStages] = useState<Stage[]>(stageList);
    const [editingStageId, setEditingStageId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");

    // Local chats state for optimistic drag and drop
    const [localChats, setLocalChats] = useState<Chat[]>(chatList);

    useEffect(() => {
        setLocalChats(chatList);
    }, [chatList]);

    // Automation local states
    const [localAutomations, setLocalAutomations] = useState<Record<string, Automation>>({});
    const [savingAutomations, setSavingAutomations] = useState<Record<string, boolean>>({});

    const supabase = createSupabaseBrowserClient();

    // Fetch automations
    const { mutate: mutateAutomations } = useSWR(['kanban_automations', restaurantId], async () => {
        const { data, error } = await supabase
            .from('automations')
            .select('*')
            .eq('restaurant_id', restaurantId);

        if (error) throw error;

        // Convert to map for easy lookup
        const authMap: Record<string, Automation> = {};
        (data as Automation[]).forEach(auth => {
            authMap[auth.stage_id] = auth;
        });

        return authMap;
    }, {
        revalidateOnFocus: false,
        onSuccess: (data) => {
            setLocalAutomations(data);
        }
    });

    const handleAutomationChange = (stageId: string, field: keyof Automation, value: string | boolean) => {
        setLocalAutomations(prev => ({
            ...prev,
            [stageId]: {
                ...prev[stageId],
                stage_id: stageId,
                [field]: value
            }
        }));
    };

    const saveAutomation = async (stageId: string) => {
        const auto = localAutomations[stageId];
        if (!auto) return;

        setSavingAutomations(prev => ({ ...prev, [stageId]: true }));
        try {
            const { error } = await supabase
                .from('automations')
                .upsert({
                    stage_id: stageId,
                    restaurant_id: restaurantId,
                    trigger: auto.trigger,
                    enabled: auto.enabled || false
                }, { onConflict: 'restaurant_id,stage_id' });

            if (error) throw error;
            mutateAutomations();
        } catch (err) {
            console.error("Erro ao salvar automação:", err);
            alert("Erro ao salvar automação.");
        } finally {
            setSavingAutomations(prev => ({ ...prev, [stageId]: false }));
        }
    };

    const scrollByAmount = (amount: number) => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
        }
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, chatId: string) => {
        e.dataTransfer.setData("chatId", chatId);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetStage: Stage) => {
        e.preventDefault();
        const chatId = e.dataTransfer.getData("chatId");
        if (!chatId) return;

        const chatToMove = localChats.find(c => c.id === chatId);
        if (!chatToMove || chatToMove.kanban_status === targetStage.name) return;

        // Optimistic UI state update
        setLocalChats(prev => prev.map(c =>
            c.id === chatId ? { ...c, kanban_status: targetStage.name } : c
        ));

        try {
            const response = await fetch(`/api/chats/${chatId}/kanban`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    stageId: targetStage.id,
                    stageName: targetStage.name
                })
            });

            if (!response.ok) {
                const rs = await response.json();
                throw new Error(rs.error || "Failed to update kanban state");
            }
        } catch (error) {
            console.error("Error updating kanban state:", error);
            // Revert on failure
            setLocalChats(chatList);
            alert("Erro ao alterar o estágio do card.");
        }
    };

    const startEditing = (stage: Stage) => {
        setEditingStageId(stage.id);
        setEditName(stage.name);
    };

    const saveStageName = async (id: string) => {
        if (!editName.trim()) {
            setEditingStageId(null);
            return;
        }

        try {
            // Optimistic update
            setStages(prev => prev.map(s => s.id === id ? { ...s, name: editName.trim() } : s));
            setEditingStageId(null);

            const { error } = await supabase
                .from("kanban_stages")
                .update({ name: editName.trim() })
                .eq("id", id);

            if (error) {
                console.error("Erro ao renomear estágio no supabase:", error);
                // Rollback ideally, but simplified for now
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="relative h-full flex flex-col overflow-hidden w-full">
            {/* Pattern sutil de fundo */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.04] [filter:hue-rotate(160deg)_saturate(0.5)] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat" />

            {/* Tabs */}
            <div className="relative z-10 px-8 pt-4 pb-2 flex gap-4">
                <button
                    onClick={() => setActiveTab("Vendas")}
                    className={`px-6 py-2.5 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 border ${activeTab === "Vendas"
                        ? "bg-[#086788] text-white border-transparent shadow-[0_5px_15px_rgba(8,103,136,0.2)]"
                        : "bg-white/40 text-[#086788] border-white/60 hover:bg-white/60 backdrop-blur-md"
                        }`}
                >
                    Fluxo de Vendas
                </button>
                <button
                    onClick={() => setActiveTab("Automacao")}
                    className={`px-6 py-2.5 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 border ${activeTab === "Automacao"
                        ? "bg-[#07a0c3] text-white border-transparent shadow-[0_5px_15px_rgba(7,160,195,0.2)]"
                        : "bg-white/40 text-[#07a0c3] border-white/60 hover:bg-white/60 backdrop-blur-md"
                        }`}
                >
                    Automação de CRM
                </button>
            </div>

            <div className="relative flex-1 min-h-0 mx-2 flex flex-col">
                {/* Setas Flutuantes */}
                <button
                    onClick={() => scrollByAmount(-350)}
                    className="absolute left-[-1rem] top-1/2 -translate-y-1/2 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-[0_5px_15px_rgba(8,103,136,0.15)] backdrop-blur hover:bg-white text-[#086788] border border-slate-200 transition-all active:scale-95"
                    aria-label="Rolar para esquerda"
                >
                    <ChevronLeft size={24} strokeWidth={3} />
                </button>
                <button
                    onClick={() => scrollByAmount(350)}
                    className="absolute right-[-1rem] top-1/2 -translate-y-1/2 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-[0_5px_15px_rgba(8,103,136,0.15)] backdrop-blur hover:bg-white text-[#086788] border border-slate-200 transition-all active:scale-95"
                    aria-label="Rolar para direita"
                >
                    <ChevronRight size={24} strokeWidth={3} />
                </button>

                {/* Board horizontal */}
                <div
                    ref={scrollRef}
                    className="flex gap-6 overflow-x-auto h-full px-8 pb-4 pt-2 no-scrollbar scroll-smooth flex-1"
                >
                    <style>{`
            .no-scrollbar::-webkit-scrollbar { display: none; }
            .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            .custom-scroll::-webkit-scrollbar { width: 5px; }
            .custom-scroll::-webkit-scrollbar-thumb { background: #07a0c3; border-radius: 10px; }
            .custom-scroll::-webkit-scrollbar-track { background: transparent; }
          `}</style>

                    {activeTab === "Automacao" ? (
                        stages.map((stage) => {
                            const autoObj = localAutomations[stage.id] || { trigger: '', enabled: false };
                            const isSaving = savingAutomations[stage.id] || false;

                            return (
                                <div key={`auto-${stage.id}`} className="w-80 shrink-0 flex flex-col h-[calc(100vh-250px)]">
                                    {/* Cabeçalho da coluna */}
                                    <div className="flex shrink-0 items-center justify-between rounded-[2rem] border border-[#07a0c3]/30 bg-white/55 px-6 py-5 shadow-lg shadow-[#07a0c3]/10 backdrop-blur-xl mb-4 group transition-colors">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="h-2 w-2 rounded-full bg-[#07a0c3] shadow-[0_0_8px_#07a0c3] shrink-0" />
                                            <h2 className="text-[12px] font-[900] uppercase tracking-[0.15em] text-[#086788] truncate mr-2 flex-1">
                                                {stage.name}
                                            </h2>
                                        </div>
                                    </div>

                                    {/* Configuração de Automação */}
                                    <div className="flex-1 flex flex-col p-6 rounded-[2.5rem] border border-white/60 bg-white/40 shadow-sm backdrop-blur-xl">
                                        <div className="flex items-center justify-between border-b border-white/50 pb-4 mb-4">
                                            <h3 className="text-[11px] font-black uppercase tracking-widest text-[#086788] flex items-center gap-2">
                                                <Bot size={16} className="text-[#07a0c3]" /> Gatilho Fiqon
                                            </h3>

                                            {/* Toggle Switch */}
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={autoObj.enabled || false}
                                                    onChange={(e) => handleAutomationChange(stage.id, 'enabled', e.target.checked)}
                                                />
                                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#07a0c3]"></div>
                                            </label>
                                        </div>

                                        <div className="flex-1 flex flex-col gap-4">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Tag do Fiqon</label>
                                                <input
                                                    type="text"
                                                    value={autoObj.trigger || ''}
                                                    onChange={(e) => handleAutomationChange(stage.id, 'trigger', e.target.value)}
                                                    className="w-full bg-white/70 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-[#086788] shadow-inner focus:outline-none focus:border-[#07a0c3]/50 focus:ring-2 focus:ring-[#07a0c3]/20"
                                                    placeholder="ex: gatilho_pedido_pronto"
                                                />
                                                <p className="text-[9px] text-slate-400 font-semibold italic mt-1 leading-relaxed">
                                                    Digite a tag exata que o Fiqon está aguardando para disparar o bloco de desconto correspondente.
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => saveAutomation(stage.id)}
                                            disabled={isSaving}
                                            className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#086788] hover:bg-[#065370] transition-colors text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-50 shadow-md shadow-[#086788]/20"
                                        >
                                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                            {isSaving ? 'Salvando...' : 'Salvar Automação'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        stages.map((stage) => {
                            // We check against the original `stageList` to keep data aligned if needed, 
                            // or just match against updated names if chats kanban_status matches the DB stage.name.
                            // Note: if name changes, existing chats with old name won't match unless kanban_status in chats is updated too (trigger needed in DB).
                            // We'll map mostly normally.
                            const stageChats = localChats.filter(
                                (chat) => (chat.kanban_status ?? "") === stage.name
                            );

                            return (
                                <div key={stage.id} className="w-80 shrink-0 flex flex-col h-[calc(100vh-250px)]">
                                    {/* Cabeçalho da coluna */}
                                    <div className="flex shrink-0 items-center justify-between rounded-[2rem] border border-white/70 bg-white/55 px-6 py-5 shadow-lg shadow-[#086788]/5 backdrop-blur-xl mb-4 group transition-colors">

                                        {editingStageId === stage.id ? (
                                            <div className="flex-1 flex flex-col gap-2">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === "Enter") saveStageName(stage.id); else if (e.key === "Escape") setEditingStageId(null); }}
                                                        autoFocus
                                                        className="flex-1 bg-white/80 border border-[#07a0c3]/40 rounded-lg px-2 py-1 text-[12px] font-black uppercase tracking-[0.1em] text-[#086788] outline-none"
                                                    />
                                                    <button onClick={() => saveStageName(stage.id)} className="p-1.5 bg-emerald-100 text-emerald-600 rounded-md hover:bg-emerald-200"><Check size={14} /></button>
                                                    <button onClick={() => setEditingStageId(null)} className="p-1.5 bg-red-100 text-red-600 rounded-md hover:bg-red-200"><X size={14} /></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div className="h-2 w-2 rounded-full bg-[#07a0c3] shadow-[0_0_8px_#07a0c3] shrink-0" />
                                                <h2 className="text-[12px] font-[900] uppercase tracking-[0.15em] text-[#086788] truncate mr-2 flex-1">
                                                    {stage.name}
                                                </h2>
                                                <button
                                                    onClick={() => startEditing(stage)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-[#07a0c3] hover:bg-cyan-50 rounded-lg transition-all"
                                                    title="Editar Nome do Estágio"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            </div>
                                        )}

                                        {editingStageId !== stage.id && (
                                            <span className="rounded-xl bg-[#086788] px-3 py-1 text-[10px] font-black text-white shadow-lg shadow-[#086788]/20 shrink-0 ml-2">
                                                {stageChats.length}
                                            </span>
                                        )}
                                    </div>

                                    {/* Lista de cards vertical */}
                                    <div
                                        className="flex-1 overflow-y-auto space-y-4 pr-3 pb-6 custom-scroll"
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, stage)}
                                    >
                                        {stageChats.length === 0 ? (
                                            <div className="rounded-[2.5rem] border-2 border-dashed border-[#086788]/10 p-10 text-center">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-[#086788]/30">
                                                    Vazio
                                                </p>
                                            </div>
                                        ) : (
                                            stageChats.map((chat) => (
                                                <div
                                                    key={chat.id}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, chat.id)}
                                                    className="group relative overflow-hidden rounded-[2.2rem] border border-white bg-white/80 p-6 shadow-sm transition-all duration-500 hover:-translate-y-[5px] hover:shadow-[0_15px_30px_-5px_rgba(8,103,136,0.15)] backdrop-blur-lg cursor-grab active:cursor-grabbing"
                                                >
                                                    {/* Indicador lateral */}
                                                    <div className="absolute left-0 top-1/4 bottom-1/4 w-1 rounded-r-full bg-[#07a0c3] opacity-0 transition-all group-hover:opacity-100" />

                                                    <div className="mb-4 flex items-start justify-between">
                                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#07a0c3] to-[#086788] text-lg font-black text-white shadow-md">
                                                            {isNaN(Number(getChatName(chat).charAt(0))) ? (
                                                                getChatName(chat).charAt(0).toUpperCase()
                                                            ) : (
                                                                <User size={22} className="opacity-90" />
                                                            )}
                                                        </div>

                                                        <button
                                                            type="button"
                                                            className="rounded-xl p-2 text-slate-300 transition-all hover:bg-cyan-50 hover:text-[#07a0c3]"
                                                            aria-label="Mais ações"
                                                        >
                                                            ⋯
                                                        </button>
                                                    </div>

                                                    <p className="truncate text-[14px] font-[900] uppercase tracking-tight text-[#086788]">
                                                        {getChatName(chat)}
                                                    </p>

                                                    <div className="mt-1 flex items-center gap-2 text-[#07a0c3]/70">
                                                        <span className="text-[10px] font-bold tracking-widest">
                                                            {getChatPhone(chat)}
                                                        </span>
                                                    </div>

                                                    <div className="mt-4 rounded-[1.5rem] border border-[#086788]/5 bg-[#f0f8f9] p-4">
                                                        <p className="line-clamp-2 text-[12px] italic leading-relaxed text-slate-600">
                                                            &quot;{chat.last_message?.trim() || "Sem última mensagem"}&quot;
                                                        </p>
                                                    </div>

                                                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                                                        <span className="text-[10px] font-black uppercase tracking-tighter text-slate-400">
                                                            {formatDate(chat.updated_at)}
                                                        </span>

                                                        <div className="flex gap-1">
                                                            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#07a0c3]" style={{ animationDelay: "0ms" }} />
                                                            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#07a0c3]" style={{ animationDelay: "150ms" }} />
                                                            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#07a0c3]" style={{ animationDelay: "300ms" }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {activeTab !== "Automacao" && stages.length === 0 && (
                        <div className="rounded-[2.5rem] border-2 border-dashed border-slate-200/70 bg-white/60 p-8 text-sm text-slate-600 backdrop-blur-xl h-fit">
                            Nenhum estágio cadastrado em kanban_stages.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
