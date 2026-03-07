"use client";

import useSWR from "swr";
import {
    Activity,
    AlertTriangle,
    Bot,
    Clock3,
    ShieldAlert,
    Wallet,
} from "lucide-react";

type AiLogRow = {
    created_at: string | null;
    chat_id: string | null;
    wa_chat_id: string | null;
    model: string | null;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    duration_ms: number | null;
};

type AiTurnRow = {
    created_at: string | null;
    chat_id: string | null;
    outcome: string | null;
    send_mode: string | null;
    iterations_started: number | null;
    tool_attempts: number | null;
    tool_successes: number | null;
    tool_blocks: number | null;
    guardrail_interventions: number | null;
    total_failures: number | null;
    last_tool_name: string | null;
    failure_reason: string | null;
};

type LogsApiResponse = {
    ok: boolean;
    windowMinutes: number;
    summary: {
        llmCalls: number;
        totalPromptTokens: number;
        totalCompletionTokens: number;
        totalTokens: number;
        avgLatencyMs: number;
        p95LatencyMs: number;
        estimatedCostUsd: number;
        turnsTotal: number;
        successfulTurns: number;
        failedTurns: number;
        blockedTurns: number;
        guardrailTurns: number;
        successRate: number;
        failureRate: number;
        blockRate: number;
        guardrailRate: number;
    };
    recentLogs: AiLogRow[];
    recentTurns: AiTurnRow[];
    lastUpdatedAt: string;
};

const fetcher = async (url: string): Promise<LogsApiResponse> => {
    const response = await fetch(url);
    const json = (await response.json()) as LogsApiResponse & {
        error?: string;
    };
    if (!response.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar logs");
    }
    return json;
};

function formatInt(value: number) {
    return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDateTime(value: string | null) {
    if (!value) return "-";
    return new Date(value).toLocaleString("pt-BR");
}

function formatCurrencyUsd(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    }).format(value);
}

function outcomeBadgeClass(outcome: string | null) {
    const normalized = (outcome || "").toLowerCase();
    if (normalized === "payload_sent" || normalized === "text_sent") {
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    if (normalized === "blocked_before_send") {
        return "bg-amber-50 text-amber-700 border-amber-200";
    }
    if (normalized === "delivery_failed" || normalized === "process_failed") {
        return "bg-rose-50 text-rose-700 border-rose-200";
    }
    return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function ReportsPage() {
    const { data, error, isLoading } = useSWR<LogsApiResponse>(
        "/api/ai/logs?window=1440&limit=60",
        fetcher,
        { refreshInterval: 5000 }
    );

    const summary = data?.summary || {
        llmCalls: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        estimatedCostUsd: 0,
        turnsTotal: 0,
        successfulTurns: 0,
        failedTurns: 0,
        blockedTurns: 0,
        guardrailTurns: 0,
        successRate: 0,
        failureRate: 0,
        blockRate: 0,
        guardrailRate: 0,
    };

    return (
        <div className="w-full h-full overflow-y-auto custom-scroll px-4 pb-10 text-slate-900 dark:text-slate-100">
            <div className="mb-6 mt-2 flex items-center justify-between rounded-[2rem] border border-white/60 dark:border-slate-700/70 bg-white/50 dark:bg-slate-900/60 px-6 py-5 shadow-lg shadow-[#086788]/5 backdrop-blur-xl">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-[#086788] dark:text-cyan-200">
                        Dashboard de Logs em Tempo Real
                    </h1>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#07a0c3] dark:text-cyan-300 mt-1">
                        Raio-X da IA: custo, latência, guardrails e falhas
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest font-black text-slate-500 dark:text-slate-300">
                        Janela
                    </p>
                    <p className="text-sm font-black">
                        {data?.windowMinutes || 1440} min
                    </p>
                    <p className="text-[10px] mt-1 text-slate-500 dark:text-slate-400">
                        Atualiza a cada 5s
                    </p>
                </div>
            </div>

            {error && (
                <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    Falha ao carregar logs: {error.message}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <div className="rounded-2xl border border-white/60 dark:border-slate-700/70 bg-white/60 dark:bg-slate-900/60 p-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-widest font-black text-[#07a0c3]">Chamadas LLM</p>
                        <Bot size={16} className="text-[#086788] dark:text-cyan-300" />
                    </div>
                    <p className="mt-2 text-2xl font-black">{isLoading ? "..." : formatInt(summary.llmCalls)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Tokens: {isLoading ? "..." : formatInt(summary.totalTokens)}
                    </p>
                </div>

                <div className="rounded-2xl border border-white/60 dark:border-slate-700/70 bg-white/60 dark:bg-slate-900/60 p-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-widest font-black text-[#07a0c3]">Latência</p>
                        <Clock3 size={16} className="text-[#086788] dark:text-cyan-300" />
                    </div>
                    <p className="mt-2 text-2xl font-black">
                        {isLoading ? "..." : `${formatInt(Math.round(summary.avgLatencyMs))} ms`}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        P95: {isLoading ? "..." : `${formatInt(Math.round(summary.p95LatencyMs))} ms`}
                    </p>
                </div>

                <div className="rounded-2xl border border-white/60 dark:border-slate-700/70 bg-white/60 dark:bg-slate-900/60 p-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-widest font-black text-[#07a0c3]">Custo Estimado</p>
                        <Wallet size={16} className="text-[#086788] dark:text-cyan-300" />
                    </div>
                    <p className="mt-2 text-2xl font-black">
                        {isLoading ? "..." : formatCurrencyUsd(summary.estimatedCostUsd)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Base: tokens de entrada/saída por modelo
                    </p>
                </div>

                <div className="rounded-2xl border border-white/60 dark:border-slate-700/70 bg-white/60 dark:bg-slate-900/60 p-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-widest font-black text-[#07a0c3]">Qualidade Operacional</p>
                        <ShieldAlert size={16} className="text-[#086788] dark:text-cyan-300" />
                    </div>
                    <p className="mt-2 text-2xl font-black">
                        {isLoading ? "..." : `${summary.successRate.toFixed(1)}%`}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Falha {summary.failureRate.toFixed(1)}% • Guardrail {summary.guardrailRate.toFixed(1)}%
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <section className="rounded-2xl border border-white/60 dark:border-slate-700/70 bg-white/60 dark:bg-slate-900/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-black uppercase tracking-widest text-[#086788] dark:text-cyan-200">
                            Últimas Chamadas LLM
                        </h2>
                        <Activity size={16} className="text-[#07a0c3] dark:text-cyan-300" />
                    </div>
                    <div className="overflow-auto max-h-[420px]">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-white/90 dark:bg-slate-900/90">
                                <tr className="text-left text-slate-500 dark:text-slate-300">
                                    <th className="py-2 pr-2">Quando</th>
                                    <th className="py-2 pr-2">Modelo</th>
                                    <th className="py-2 pr-2">Total Tokens</th>
                                    <th className="py-2 pr-2">Latência</th>
                                    <th className="py-2 pr-2">Chat</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(data?.recentLogs || []).map((row, index) => (
                                    <tr key={`${row.created_at || "na"}-${index}`} className="border-t border-slate-200/60 dark:border-slate-700/60">
                                        <td className="py-2 pr-2">{formatDateTime(row.created_at)}</td>
                                        <td className="py-2 pr-2 font-semibold">{row.model || "-"}</td>
                                        <td className="py-2 pr-2">{formatInt(Number(row.total_tokens || 0))}</td>
                                        <td className="py-2 pr-2">{formatInt(Number(row.duration_ms || 0))} ms</td>
                                        <td className="py-2 pr-2 font-mono text-[10px]">{(row.chat_id || "-").slice(0, 8)}</td>
                                    </tr>
                                ))}
                                {!isLoading && (data?.recentLogs || []).length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                                            Sem logs de LLM na janela selecionada.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="rounded-2xl border border-white/60 dark:border-slate-700/70 bg-white/60 dark:bg-slate-900/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-black uppercase tracking-widest text-[#086788] dark:text-cyan-200">
                            Últimos Turnos da IA
                        </h2>
                        <AlertTriangle size={16} className="text-[#07a0c3] dark:text-cyan-300" />
                    </div>
                    <div className="overflow-auto max-h-[420px]">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-white/90 dark:bg-slate-900/90">
                                <tr className="text-left text-slate-500 dark:text-slate-300">
                                    <th className="py-2 pr-2">Quando</th>
                                    <th className="py-2 pr-2">Resultado</th>
                                    <th className="py-2 pr-2">Tools</th>
                                    <th className="py-2 pr-2">Guardrail</th>
                                    <th className="py-2 pr-2">Última Tool</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(data?.recentTurns || []).map((row, index) => (
                                    <tr key={`${row.created_at || "na"}-${index}`} className="border-t border-slate-200/60 dark:border-slate-700/60">
                                        <td className="py-2 pr-2">{formatDateTime(row.created_at)}</td>
                                        <td className="py-2 pr-2">
                                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-bold ${outcomeBadgeClass(row.outcome)}`}>
                                                {row.outcome || "-"}
                                            </span>
                                            {row.failure_reason ? (
                                                <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-300">{row.failure_reason}</p>
                                            ) : null}
                                        </td>
                                        <td className="py-2 pr-2">
                                            {formatInt(Number(row.tool_successes || 0))}/{formatInt(Number(row.tool_attempts || 0))}
                                        </td>
                                        <td className="py-2 pr-2">{formatInt(Number(row.guardrail_interventions || 0))}</td>
                                        <td className="py-2 pr-2">{row.last_tool_name || "-"}</td>
                                    </tr>
                                ))}
                                {!isLoading && (data?.recentTurns || []).length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                                            Sem turnos de IA na janela selecionada.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            <p className="mt-4 text-[11px] text-slate-500 dark:text-slate-400">
                Última atualização: {data?.lastUpdatedAt ? formatDateTime(data.lastUpdatedAt) : "-"}
            </p>
        </div>
    );
}

