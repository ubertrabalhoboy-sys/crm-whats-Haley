"use client";

import React from "react";
import { User, Pencil, Check, X, ChevronLeft, ChevronRight } from "lucide-react";

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

interface SalesFlowProps {
    stages: Stage[];
    localChats: Chat[];
    editingStageId: string | null;
    setEditingStageId: (id: string | null) => void;
    editName: string;
    setEditName: (name: string) => void;
    saveStageName: (id: string) => Promise<void>;
    startEditing: (stage: Stage) => void;
    dragOverStageId: string | null;
    handleDragStart: (e: React.DragEvent<HTMLDivElement>, chatId: string) => void;
    handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    handleDragEnter: (stageId: string) => void;
    handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
    handleDrop: (e: React.DragEvent<HTMLDivElement>, stage: Stage) => Promise<void>;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    scrollByAmount: (amount: number) => void;
}

export default function SalesFlow({
    stages,
    localChats,
    editingStageId,
    setEditingStageId,
    editName,
    setEditName,
    saveStageName,
    startEditing,
    dragOverStageId,
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    scrollRef,
    scrollByAmount,
}: SalesFlowProps) {
    return (
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

            <div
                ref={scrollRef}
                className="flex gap-6 overflow-x-auto h-full px-8 pb-4 pt-2 no-scrollbar scroll-smooth flex-1"
            >
                {stages.map((stage) => {
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
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") saveStageName(stage.id);
                                                    else if (e.key === "Escape") setEditingStageId(null);
                                                }}
                                                autoFocus
                                                className="flex-1 bg-white/80 border border-[#07a0c3]/40 rounded-lg px-2 py-1 text-[12px] font-black uppercase tracking-[0.1em] text-[#086788] outline-none"
                                            />
                                            <button onClick={() => saveStageName(stage.id)} className="p-1.5 bg-emerald-100 text-emerald-600 rounded-md hover:bg-emerald-200">
                                                <Check size={14} />
                                            </button>
                                            <button onClick={() => setEditingStageId(null)} className="p-1.5 bg-red-100 text-red-600 rounded-md hover:bg-red-200">
                                                <X size={14} />
                                            </button>
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
                                className={`flex-1 overflow-y-auto space-y-4 pr-3 pb-6 custom-scroll rounded-[2rem] transition-all duration-200 ${dragOverStageId === stage.id ? "bg-[#07a0c3]/10 ring-2 ring-[#07a0c3]/40 ring-inset" : ""}`}
                                onDragOver={handleDragOver}
                                onDragEnter={() => handleDragEnter(stage.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, stage)}
                            >
                                {stageChats.length === 0 ? (
                                    <div className="rounded-[2.5rem] border-2 border-dashed border-[#086788]/10 p-10 text-center">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[#086788]/30">Vazio</p>
                                    </div>
                                ) : (
                                    stageChats.map((chat) => (
                                        <div
                                            key={chat.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, chat.id)}
                                            className={`group relative overflow-hidden rounded-[2.2rem] border p-6 shadow-sm transition-all duration-500 hover:-translate-y-[5px] hover:shadow-[0_15px_30px_-5px_rgba(8,103,136,0.15)] backdrop-blur-lg cursor-grab active:cursor-grabbing ${stage.name === "Atendimento Humano"
                                                    ? "bg-red-50/90 border-red-200"
                                                    : "bg-white/80 border-white"
                                                }`}
                                        >
                                            {/* Indicador lateral */}
                                            <div className="absolute left-0 top-1/4 bottom-1/4 w-1 rounded-r-full bg-[#07a0c3] opacity-0 transition-all group-hover:opacity-100" />

                                            <div className="mb-4 flex items-start justify-between">
                                                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white shadow-md ${stage.name === "Atendimento Humano"
                                                        ? "bg-gradient-to-br from-red-500 to-red-700"
                                                        : "bg-gradient-to-br from-[#07a0c3] to-[#086788]"
                                                    }`}>
                                                    {isNaN(Number(getChatName(chat).charAt(0))) ? (
                                                        getChatName(chat).charAt(0).toUpperCase()
                                                    ) : (
                                                        <User size={22} className="opacity-90" />
                                                    )}
                                                </div>
                                            </div>

                                            <p className="truncate text-[14px] font-[900] uppercase tracking-tight text-[#086788]">{getChatName(chat)}</p>

                                            <div className="mt-1 flex items-center gap-2 text-[#07a0c3]/70">
                                                <span className="text-[10px] font-bold tracking-widest">{getChatPhone(chat)}</span>
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
                })}
            </div>
        </div>
    );
}
