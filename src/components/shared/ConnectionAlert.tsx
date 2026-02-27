"use client";

import useSWR from "swr";
import { AlertTriangle, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const fetcher = async (url: string) => {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Erro de Fetch");
    return json;
};

export default function ConnectionAlert() {
    const pathname = usePathname();

    // Don't show the alert on the settings page itself (avoid redundancy)
    const isSettingsPage = pathname === "/settings/whatsapp";

    const { data, error } = useSWR<{ ok: boolean; status?: any; connected?: boolean }>(
        "/api/whatsapp/status",
        fetcher,
        {
            refreshInterval: 30000, // Check every 30 seconds
            revalidateOnFocus: true
        }
    );

    if (isSettingsPage) return null;

    const state = String(typeof data?.status === "string" ? data.status : (data?.status as any)?.state || "").toLowerCase();
    const isConnected = ["open", "connected", "ready", "online"].includes(state) || data?.connected === true;

    // Se sabemos que está conectado (mesmo que o refresh atual tenha dado erro de rede), ocultamos o alerta.
    if (isConnected) return null;

    // Se não temos dados e não temos erro (ainda carregando pela primeira vez) -> ocultamos pra não piscar.
    if (!data && !error) return null;

    return (
        <div className="w-full bg-red-500/90 text-white backdrop-blur-md border-b border-red-400 py-3 px-6 flex items-center justify-between shadow-md relative z-50">
            <div className="flex items-center gap-3">
                <div className="bg-red-600/50 p-1.5 rounded-lg border border-white/20">
                    <WifiOff size={20} className="animate-pulse" />
                </div>
                <div className="flex flex-col">
                    <span className="font-bold text-sm tracking-wide">⚠️ Seu WhatsApp está desconectado!</span>
                    <span className="text-xs text-red-100 font-medium">Você pode perder vendas e mensagens de automação.</span>
                </div>
            </div>
            <Link
                href="/settings/whatsapp"
                className="px-4 py-2 bg-white text-red-600 font-black text-xs uppercase tracking-widest rounded-xl shadow-sm hover:bg-red-50 hover:shadow-md transition-all active:scale-95 border border-red-200"
            >
                Reconectar Agora
            </Link>
        </div>
    );
}
