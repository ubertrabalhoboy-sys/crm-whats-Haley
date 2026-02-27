"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, X, Info, AlertCircle, CheckCircle, Package } from "lucide-react";
import useSWR from "swr";

type Notification = {
    id: string;
    title: string;
    message: string;
    type: "info" | "success" | "warning" | "error" | "order";
    is_read: boolean;
    created_at: string;
};

const fetcher = async (url: string) => {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data.notifications as Notification[];
};

export default function NotificationBell() {
    const [isOpen, setIsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Default refresh interval 30 seconds
    const { data: notifications, error, mutate } = useSWR<Notification[]>(
        "/api/notifications",
        fetcher,
        { refreshInterval: 30000, fallbackData: [] }
    );

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const dismissNotification = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();

        // Optimistic update
        const previousData = notifications;
        mutate((currentData) => currentData?.filter(n => n.id !== id), false);

        try {
            const res = await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            // Revalidate
            mutate();
        } catch (err) {
            console.error("Failed to dismiss notification", err);
            // Revert optimistic update on error
            mutate(previousData, false);
        }
    };

    const count = notifications?.length || 0;

    return (
        <div className="relative z-50" ref={popoverRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-3.5 bg-blue-500/5 backdrop-blur-md border border-blue-200/50 rounded-2xl text-blue-600 hover:text-white hover:bg-blue-600 hover:shadow-[0_0_20px_rgba(37,99,235,0.2)] transition-all duration-300"
            >
                <Bell size={22} className={count > 0 ? "animate-wiggle" : ""} />
                {count > 0 && (
                    <span className="absolute top-2 right-2 flex min-w-[20px] h-[20px] items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-white shadow-sm ring-1 ring-red-300 px-1">
                        {count > 99 ? '99+' : count}
                    </span>
                )}
            </button>

            {/* Popover */}
            {isOpen && (
                <div className="absolute top-full right-0 mt-3 w-80 sm:w-96 bg-white/90 backdrop-blur-xl border border-white/60 shadow-2xl rounded-3xl overflow-hidden transform origin-top-right transition-all animate-in fade-in zoom-in duration-200">
                    <div className="border-b border-slate-100 bg-slate-50/50 p-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Notificações</h3>
                            {count > 0 && (
                                <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                                    {count} não lidas
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto custom-scroll p-2">
                        {error && (
                            <div className="p-4 text-center text-sm text-red-500">
                                Erro ao carregar.
                            </div>
                        )}

                        {!error && (!notifications || notifications.length === 0) ? (
                            <div className="py-12 flex flex-col items-center justify-center text-center">
                                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                                    <Bell size={20} className="text-slate-400" />
                                </div>
                                <p className="text-slate-500 text-sm font-medium">Tudo limpo por aqui!</p>
                                <p className="text-slate-400 text-xs mt-1">Nenhuma notificação nova no momento.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1">
                                {notifications?.map((notif) => (
                                    <div
                                        key={notif.id}
                                        className="group relative flex gap-3 rounded-2xl p-3 hover:bg-slate-50 transition-colors cursor-default"
                                    >
                                        <div className="shrink-0 mt-0.5">
                                            {notif.type === 'success' && <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><CheckCircle size={16} /></div>}
                                            {notif.type === 'error' && <div className="h-8 w-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center"><AlertCircle size={16} /></div>}
                                            {notif.type === 'warning' && <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center"><AlertCircle size={16} /></div>}
                                            {notif.type === 'order' && <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center"><Package size={16} /></div>}
                                            {(!['success', 'error', 'warning', 'order'].includes(notif.type)) && <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><Info size={16} /></div>}
                                        </div>

                                        <div className="flex-1 min-w-0 pr-6">
                                            <p className="text-sm font-bold text-slate-800 break-words leading-tight">{notif.title}</p>
                                            <p className="text-xs text-slate-500 mt-1 break-words line-clamp-3 leading-snug">{notif.message}</p>
                                            <p className="text-[10px] text-slate-400 font-medium mt-1.5 uppercase">
                                                {new Date(notif.created_at).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>

                                        <button
                                            onClick={(e) => dismissNotification(e, notif.id)}
                                            className="absolute top-3 right-3 p-1.5 rounded-full text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-200 hover:text-slate-700 transition-all"
                                            title="Dispensar notificação"
                                        >
                                            <X size={14} strokeWidth={3} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {/* Add visual padding at the bottom of standard unread list */}
                    {count > 0 && <div className="bg-slate-50 border-t border-slate-100 p-2 text-center text-[10px] text-slate-400">Pressione X nas notificações para descartar.</div>}
                </div>
            )}
        </div>
    );
}
