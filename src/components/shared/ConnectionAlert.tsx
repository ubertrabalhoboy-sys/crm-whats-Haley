"use client";

import useSWR from "swr";
import { WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type StatusResponse = {
  ok: boolean;
  status?: string;
  connected?: boolean;
  statusReason?: string | null;
  hints?: string[];
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = (await res.json()) as StatusResponse & { error?: string };
  if (!json.ok) throw new Error(json.error || "Erro de Fetch");
  return json;
};

export default function ConnectionAlert() {
  const pathname = usePathname();
  const isSettingsPage = pathname === "/settings/whatsapp";

  const { data, error, isLoading } = useSWR<StatusResponse>("/api/whatsapp/status", fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  if (isSettingsPage || isLoading) return null;
  if (!data && !error) return null;

  const statusValue = typeof data?.status === "string" ? data.status.toLowerCase() : "";
  const isConnected = data?.connected === true || statusValue === "open" || statusValue === "connected";
  if (isConnected) return null;

  const reason = data?.statusReason?.trim() || "Você pode perder vendas e mensagens de automação.";
  const firstHint =
    Array.isArray(data?.hints) && data.hints.length > 0 && typeof data.hints[0] === "string"
      ? data.hints[0]
      : null;

  return (
    <div className="w-full bg-red-500/90 text-white backdrop-blur-md border-b border-red-400 py-3 px-6 flex items-center justify-between shadow-md relative z-50">
      <div className="flex items-center gap-3">
        <div className="bg-red-600/50 p-1.5 rounded-lg border border-white/20">
          <WifiOff size={20} className="animate-pulse" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-sm tracking-wide">Seu WhatsApp está desconectado.</span>
          <span className="text-xs text-red-100 font-medium">{reason}</span>
          {firstHint && <span className="text-[11px] text-red-50/90 font-semibold mt-0.5">Dica: {firstHint}</span>}
        </div>
      </div>
      <Link
        href="/settings/whatsapp"
        className="px-4 py-2 bg-white text-red-600 font-black text-xs uppercase tracking-widest rounded-xl shadow-sm hover:bg-red-50 hover:shadow-md transition-all active:scale-95 border border-red-200"
      >
        Ver Diagnóstico
      </Link>
    </div>
  );
}
