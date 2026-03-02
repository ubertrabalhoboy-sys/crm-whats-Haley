"use client";

import useSWR from "swr";
import { Bell, Bot, ShieldAlert, Sparkles, TrendingUp, TriangleAlert } from "lucide-react";

type MetricsResponse = {
    ok: boolean;
    error?: string;
    summary?: {
        turnsTotal: number;
        successfulTurns: number;
        blockedTurns: number;
        guardrailTurns: number;
        failedTurns: number;
        payloadTurns: number;
        textTurns: number;
        avgIterations: number;
        successRate: number;
        blockRate: number;
        guardrailRate: number;
        failureRate: number;
    };
    outcomeBreakdown?: Array<{
        outcome: string;
        count: number;
    }>;
    recentTurns?: Array<{
        created_at: string | null;
        outcome: string;
        send_mode: string;
        tool_blocks: number;
        tool_attempts: number;
        tool_successes: number;
        tool_skips: number;
        guardrail_interventions: number;
        total_failures: number;
        iterations_started: number;
        last_tool_name: string | null;
        failure_reason: string | null;
    }>;
};

const fetcher = async (url: string) => {
    const response = await fetch(url, { cache: "no-store" });
    const json = (await response.json()) as MetricsResponse;
    if (!response.ok || !json.ok) {
        throw new Error(json.error || "Falha ao carregar métricas da IA.");
    }
    return json;
};

function MetricCard({
    title,
    value,
    caption,
    icon,
    tone = "blue",
}: {
    title: string;
    value: string;
    caption: string;
    icon: React.ReactNode;
    tone?: "blue" | "emerald" | "amber" | "rose";
}) {
    const tones = {
        blue: "from-[#086788] to-[#07a0c3] text-[#086788] border-cyan-100",
        emerald: "from-emerald-600 to-lime-500 text-emerald-700 border-emerald-100",
        amber: "from-amber-500 to-orange-500 text-amber-700 border-amber-100",
        rose: "from-rose-500 to-red-500 text-rose-700 border-rose-100",
    };

    return (
        <div className="rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                        {title}
                    </p>
                    <p className={`mt-3 text-4xl font-[950] tracking-tight ${tones[tone].split(" ")[2]}`}>
                        {value}
                    </p>
                </div>
                <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${tones[tone].split(" ").slice(0, 2).join(" ")} text-white shadow-lg`}
                >
                    {icon}
                </div>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{caption}</p>
        </div>
    );
}

function formatOutcome(outcome: string) {
    const labels: Record<string, string> = {
        payload_sent: "Payload enviado",
        text_sent: "Texto enviado",
        blocked_before_send: "Bloqueado antes do envio",
        delivery_failed: "Falha de entrega",
        max_iterations_reached: "Limite de iterações",
        stopped_without_send: "Parou sem envio",
        process_failed: "Falha no processo",
    };

    return labels[outcome] || outcome;
}

function formatDate(value: string | null) {
    if (!value) return "Sem data";
    return new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export const dynamic = "force-dynamic";

export default function AiSettingsPage() {
    const { data, error, isLoading, mutate } = useSWR<MetricsResponse>(
        "/api/ai/metrics",
        fetcher,
        { refreshInterval: 30000 }
    );

    const summary = data?.summary;
    const recentTurns = data?.recentTurns || [];
    const outcomeBreakdown = data?.outcomeBreakdown || [];

    return (
        <div className="relative h-full w-full overflow-y-auto custom-scroll px-2 pb-6">
            <div className="pointer-events-none fixed inset-0 opacity-[0.03] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />

            <div className="relative z-10 mx-2 mb-8 mt-2 flex items-center justify-between rounded-[2.5rem] border border-white/60 bg-white/40 px-8 py-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#086788] to-[#07a0c3] text-white shadow-lg shadow-[#086788]/20">
                        <Bot size={24} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-[950] uppercase tracking-tighter text-[#086788] leading-none">
                            Central da IA
                        </h1>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-[#07a0c3]">
                            Saude operacional e rendimento do agente
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => mutate()}
                    className="rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-3 text-[10px] font-black uppercase tracking-[0.25em] text-[#086788] transition hover:bg-cyan-100"
                >
                    Atualizar
                </button>
            </div>

            {isLoading ? (
                <div className="relative z-10 mx-2 rounded-[2rem] border border-white/60 bg-white/50 p-8 text-sm font-bold text-slate-500 shadow-lg shadow-[#086788]/5 backdrop-blur-xl">
                    Carregando métricas da IA...
                </div>
            ) : error ? (
                <div className="relative z-10 mx-2 rounded-[2rem] border border-rose-200 bg-rose-50/90 p-8 text-sm font-bold text-rose-700 shadow-lg shadow-rose-200/40 backdrop-blur-xl">
                    {error.message}
                </div>
            ) : (
                <>
                    <div className="relative z-10 mx-2 grid grid-cols-1 gap-6 xl:grid-cols-4">
                        <MetricCard
                            title="Taxa de Sucesso"
                            value={`${summary?.successRate ?? 0}%`}
                            caption={`${summary?.successfulTurns ?? 0} turnos com entrega concluida`}
                            icon={<TrendingUp size={22} />}
                            tone="emerald"
                        />
                        <MetricCard
                            title="Taxa de Bloqueio"
                            value={`${summary?.blockRate ?? 0}%`}
                            caption={`${summary?.blockedTurns ?? 0} turnos com bloqueio de tool ou envio`}
                            icon={<ShieldAlert size={22} />}
                            tone="amber"
                        />
                        <MetricCard
                            title="Guardrails"
                            value={`${summary?.guardrailRate ?? 0}%`}
                            caption={`${summary?.guardrailTurns ?? 0} turnos com alguma intervencao`}
                            icon={<Sparkles size={22} />}
                            tone="blue"
                        />
                        <MetricCard
                            title="Falhas"
                            value={`${summary?.failureRate ?? 0}%`}
                            caption={`${summary?.failedTurns ?? 0} turnos com erro operacional`}
                            icon={<TriangleAlert size={22} />}
                            tone="rose"
                        />
                    </div>

                    <div className="relative z-10 mx-2 mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                        <div className="rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl xl:col-span-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                                Resumo da janela
                            </p>
                            <div className="mt-5 grid grid-cols-2 gap-4">
                                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Turnos</p>
                                    <p className="mt-2 text-2xl font-[900] text-slate-800">{summary?.turnsTotal ?? 0}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Iterações médias</p>
                                    <p className="mt-2 text-2xl font-[900] text-slate-800">{summary?.avgIterations ?? 0}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payloads</p>
                                    <p className="mt-2 text-2xl font-[900] text-slate-800">{summary?.payloadTurns ?? 0}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Textos</p>
                                    <p className="mt-2 text-2xl font-[900] text-slate-800">{summary?.textTurns ?? 0}</p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl xl:col-span-2">
                            <div className="mb-5 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                    <Bell size={18} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                                        Resultado por turno
                                    </p>
                                    <p className="text-sm font-black text-slate-700">
                                        Distribuicao dos desfechos nos ultimos 7 dias
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {outcomeBreakdown.map((item) => (
                                    <div
                                        key={item.outcome}
                                        className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4"
                                    >
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            {formatOutcome(item.outcome)}
                                        </p>
                                        <p className="mt-2 text-2xl font-[900] text-slate-800">{item.count}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 mx-2 mt-6 rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-[#086788]">
                                <Bot size={18} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                                    Ultimos turnos
                                </p>
                                <p className="text-sm font-black text-slate-700">
                                    Amostra operacional das ultimas 12 execucoes
                                </p>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left whitespace-nowrap">
                                <thead>
                                    <tr className="border-b border-slate-200/80">
                                        <th className="px-3 py-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Quando</th>
                                        <th className="px-3 py-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Resultado</th>
                                        <th className="px-3 py-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Envio</th>
                                        <th className="px-3 py-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Tools</th>
                                        <th className="px-3 py-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Guardrails</th>
                                        <th className="px-3 py-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Ultima tool</th>
                                        <th className="px-3 py-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Falha</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentTurns.map((turn, index) => (
                                        <tr
                                            key={`${turn.created_at || "sem-data"}-${index}`}
                                            className="border-b border-slate-100/80 last:border-b-0"
                                        >
                                            <td className="px-3 py-4 text-xs font-bold text-slate-500">
                                                {formatDate(turn.created_at)}
                                            </td>
                                            <td className="px-3 py-4 text-xs font-black text-slate-800">
                                                {formatOutcome(turn.outcome)}
                                            </td>
                                            <td className="px-3 py-4 text-xs font-bold uppercase tracking-widest text-slate-500">
                                                {turn.send_mode}
                                            </td>
                                            <td className="px-3 py-4 text-xs font-bold text-slate-500">
                                                {turn.tool_successes}/{turn.tool_attempts}
                                            </td>
                                            <td className="px-3 py-4 text-xs font-bold text-slate-500">
                                                {turn.guardrail_interventions}
                                            </td>
                                            <td className="px-3 py-4 text-xs font-bold text-slate-500">
                                                {turn.last_tool_name || "Sem tool"}
                                            </td>
                                            <td className="px-3 py-4 text-xs font-bold text-rose-600">
                                                {turn.failure_reason || "-"}
                                            </td>
                                        </tr>
                                    ))}
                                    {recentTurns.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={7}
                                                className="px-3 py-8 text-center text-sm font-bold text-slate-500"
                                            >
                                                Ainda nao ha turnos suficientes para exibir.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
