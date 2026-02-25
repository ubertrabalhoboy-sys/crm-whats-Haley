"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight, User } from "lucide-react";

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

export default function KanbanBoard({
    stageList,
    chatList,
}: {
    stageList: Stage[];
    chatList: Chat[];
}) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scrollByAmount = (amount: number) => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
        }
    };

    return (
        <div className="relative h-full flex flex-col overflow-hidden w-full">
            {/* Pattern sutil de fundo */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.04] [filter:hue-rotate(160deg)_saturate(0.5)] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat" />



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
                    {stageList.map((stage) => {
                        const stageChats = chatList.filter(
                            (chat) => (chat.kanban_status ?? "") === stage.name
                        );

                        return (
                            <div key={stage.id} className="w-80 shrink-0 flex flex-col h-[calc(100vh-200px)]">
                                {/* Cabeçalho da coluna */}
                                <div className="flex shrink-0 items-center justify-between rounded-[2rem] border border-white/70 bg-white/55 px-6 py-5 shadow-lg shadow-[#086788]/5 backdrop-blur-xl mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-2 w-2 rounded-full bg-[#07a0c3] shadow-[0_0_8px_#07a0c3]" />
                                        <h2 className="text-[12px] font-[900] uppercase tracking-[0.15em] text-[#086788] truncate max-w-[140px]">
                                            {stage.name}
                                        </h2>
                                    </div>

                                    <span className="rounded-xl bg-[#086788] px-3 py-1 text-[10px] font-black text-white shadow-lg shadow-[#086788]/20">
                                        {stageChats.length}
                                    </span>
                                </div>

                                {/* Lista de cards vertical */}
                                <div className="flex-1 overflow-y-auto space-y-4 pr-3 pb-6 custom-scroll">
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
                                                className="group relative overflow-hidden rounded-[2.2rem] border border-white bg-white/80 p-6 shadow-sm transition-all duration-500 hover:-translate-y-[5px] hover:shadow-[0_15px_30px_-5px_rgba(8,103,136,0.15)] backdrop-blur-lg"
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
                                                        "{chat.last_message?.trim() || "Sem última mensagem"}"
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

                    {stageList.length === 0 && (
                        <div className="rounded-[2.5rem] border-2 border-dashed border-slate-200/70 bg-white/60 p-8 text-sm text-slate-600 backdrop-blur-xl h-fit">
                            Nenhum estágio cadastrado em kanban_stages.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
