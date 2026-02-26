"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { X, CheckCircle, AlertTriangle, Info } from "lucide-react";

type ToastType = "success" | "error" | "info";

type Toast = {
    id: string;
    message: string;
    type: ToastType;
};

type ToastContextType = {
    showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextType>({ showToast: () => { } });

export function useToast() {
    return useContext(ToastContext);
}

const ICON_MAP = {
    success: CheckCircle,
    error: AlertTriangle,
    info: Info,
};

const STYLE_MAP = {
    success: "border-emerald-400/50 bg-emerald-950/80 text-emerald-100",
    error: "border-rose-400/50 bg-rose-950/80 text-rose-100",
    info: "border-cyan-400/50 bg-cyan-950/80 text-cyan-100",
};

const ICON_STYLE_MAP = {
    success: "text-emerald-400",
    error: "text-rose-400",
    info: "text-cyan-400",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
    const Icon = ICON_MAP[toast.type];

    useEffect(() => {
        const timer = setTimeout(() => onDismiss(toast.id), 4000);
        return () => clearTimeout(timer);
    }, [toast.id, onDismiss]);

    return (
        <div
            className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl border backdrop-blur-xl shadow-2xl animate-slide-in ${STYLE_MAP[toast.type]}`}
        >
            <Icon size={18} className={`shrink-0 ${ICON_STYLE_MAP[toast.type]}`} />
            <p className="text-[13px] font-semibold flex-1">{toast.message}</p>
            <button
                onClick={() => onDismiss(toast.id)}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
            >
                <X size={14} />
            </button>
        </div>
    );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = "info") => {
        const id = crypto.randomUUID();
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast Container */}
            <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm">
                <style>{`
                    @keyframes slide-in {
                        from { opacity: 0; transform: translateX(100px); }
                        to { opacity: 1; transform: translateX(0); }
                    }
                    .animate-slide-in {
                        animation: slide-in 0.3s ease-out forwards;
                    }
                `}</style>
                {toasts.map(toast => (
                    <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}
