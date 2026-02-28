"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/shared/Toast";
import { Loader2 } from "lucide-react";

// Dynamic imports for better performance
const SalesFlow = dynamic(() => import("./SalesFlow"), {
    loading: () => (
        <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#086788]" />
        </div>
    )
});

const CRMAutomation = dynamic(() => import("./CRMAutomation"), {
    loading: () => (
        <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#07a0c3]" />
        </div>
    )
});

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
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState("Vendas");

    // Shared State Management (Integrity)
    const [stages, setStages] = useState<Stage[]>(stageList);
    const [editingStageId, setEditingStageId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");

    const [localChats, setLocalChats] = useState<Chat[]>(chatList);
    const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

    useEffect(() => {
        setLocalChats(chatList);
    }, [chatList]);

    // Stable Supabase client reference (prevents React hydration mismatch #418)
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

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

    const handleDragEnter = (stageId: string) => {
        setDragOverStageId(stageId);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverStageId(null);
        }
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetStage: Stage) => {
        e.preventDefault();
        setDragOverStageId(null);
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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    stageId: targetStage.id,
                    stageName: targetStage.name
                })
            });

            if (!response.ok) throw new Error("Failed to update kanban state");
        } catch (error) {
            console.error("Error updating kanban state:", error);
            setLocalChats(chatList);
            showToast("Erro ao alterar o estágio do card.", "error");
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
            setStages(prev => prev.map(s => s.id === id ? { ...s, name: editName.trim() } : s));
            setEditingStageId(null);
            const { error } = await supabase.from("kanban_stages").update({ name: editName.trim() }).eq("id", id);
            if (error) throw error;
        } catch (err) {
            console.error(err);
            showToast("Erro ao renomear estágio.", "error");
        }
    };

    return (
        <div className="relative h-full flex flex-col overflow-hidden w-full">
            {/* Pattern sutil de fundo */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.04] [filter:hue-rotate(160deg)_saturate(0.5)] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat" />

            {/* Nav Tabs */}
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
                <style>{`
                    .no-scrollbar::-webkit-scrollbar { display: none; }
                    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                    .custom-scroll::-webkit-scrollbar { width: 5px; }
                    .custom-scroll::-webkit-scrollbar-thumb { background: #07a0c3; border-radius: 10px; }
                    .custom-scroll::-webkit-scrollbar-track { background: transparent; }
                `}</style>

                {activeTab === "Vendas" ? (
                    <SalesFlow
                        stages={stages}
                        localChats={localChats}
                        editingStageId={editingStageId}
                        setEditingStageId={setEditingStageId}
                        editName={editName}
                        setEditName={setEditName}
                        saveStageName={saveStageName}
                        startEditing={startEditing}
                        dragOverStageId={dragOverStageId}
                        handleDragStart={handleDragStart}
                        handleDragOver={handleDragOver}
                        handleDragEnter={handleDragEnter}
                        handleDragLeave={handleDragLeave}
                        handleDrop={handleDrop}
                        scrollRef={scrollRef}
                        scrollByAmount={scrollByAmount}
                    />
                ) : (
                    <CRMAutomation stages={stages} restaurantId={restaurantId} />
                )}
            </div>
        </div>
    );
}
