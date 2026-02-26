"use client";

import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { Plus, Trash2, Save, Loader2, Dices, AlertTriangle, CheckCircle2 } from "lucide-react";

type Prize = {
    id?: string;
    label: string;
    trigger_tag: string;
    chance_percentage: number;
    color: string;
};

const DEFAULT_COLORS = [
    "#EF4444", "#F97316", "#EAB308", "#22C55E",
    "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899"
];

const fetcher = async (url: string) => {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Erro de Fetch");
    return json;
};

export default function RoletaPage() {
    const { data, isLoading } = useSWR<{ ok: boolean; prizes: Prize[] }>("/api/roleta", fetcher);
    const [prizes, setPrizes] = useState<Prize[]>([]);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

    useEffect(() => {
        if (data?.prizes) {
            setPrizes(data.prizes.length > 0 ? data.prizes : []);
        }
    }, [data]);

    const sum = prizes.reduce((acc, p) => acc + (Number(p.chance_percentage) || 0), 0);
    const isValid = sum === 100 && prizes.length >= 1 && prizes.every(p => p.label.trim() && p.trigger_tag.trim());
    const canAdd = prizes.length < 8;

    const addPrize = () => {
        if (!canAdd) return;
        setPrizes(prev => [
            ...prev,
            {
                label: "",
                trigger_tag: "",
                chance_percentage: 0,
                color: DEFAULT_COLORS[prev.length % DEFAULT_COLORS.length],
            }
        ]);
    };

    const removePrize = (index: number) => {
        setPrizes(prev => prev.filter((_, i) => i !== index));
    };

    const updatePrize = (index: number, field: keyof Prize, value: string | number) => {
        setPrizes(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
    };

    const handleSave = async () => {
        if (!isValid) return;
        setSaving(true);
        setFeedback(null);
        try {
            const res = await fetch("/api/roleta", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prizes }),
            });
            const json = await res.json();
            if (!json.ok) throw new Error(json.error);
            setFeedback({ type: "success", message: "Prêmios salvos com sucesso!" });
            mutate("/api/roleta");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Erro ao salvar.";
            setFeedback({ type: "error", message: msg });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full h-full overflow-y-auto custom-scroll px-4 pb-12">
            {/* Pattern de fundo */}
            <div className="pointer-events-none fixed inset-0 opacity-[0.03] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />

            {/* Header */}
            <div className="mb-8 mt-2 flex items-center justify-between rounded-[2.5rem] border border-white/60 bg-white/40 px-8 py-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl relative z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-lg shadow-purple-500/20 animate-spin-slow">
                        <Dices size={24} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-[950] uppercase tracking-tighter text-[#086788] leading-none">
                            Roleta Inteligente
                        </h1>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-[#07a0c3]">
                            Configure os Prêmios e Probabilidades
                        </p>
                    </div>
                </div>
            </div>

            {/* Chance Sum Indicator */}
            <div className="mb-6 relative z-10">
                <div className="flex items-center justify-between rounded-[2rem] border border-white/60 bg-white/40 px-8 py-5 backdrop-blur-xl shadow-sm">
                    <div className="flex items-center gap-3">
                        {sum === 100 ? (
                            <CheckCircle2 size={22} className="text-emerald-500" />
                        ) : (
                            <AlertTriangle size={22} className="text-amber-500" />
                        )}
                        <span className="text-sm font-black text-slate-700">
                            Soma das Chances:
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="w-48 h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${sum === 100 ? 'bg-emerald-500' : sum > 100 ? 'bg-red-500' : 'bg-amber-400'}`}
                                style={{ width: `${Math.min(sum, 100)}%` }}
                            />
                        </div>
                        <span className={`text-2xl font-black tabular-nums ${sum === 100 ? 'text-emerald-600' : sum > 100 ? 'text-red-600' : 'text-amber-600'}`}>
                            {sum}%
                        </span>
                    </div>
                </div>
                {sum !== 100 && prizes.length > 0 && (
                    <p className="mt-2 text-xs font-bold text-red-500 text-center">
                        {sum > 100 ? `Excedido em ${sum - 100}%. Reduza as chances.` : `Faltam ${100 - sum}% para completar.`}
                    </p>
                )}
            </div>

            {/* Prizes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 relative z-10">
                {isLoading ? (
                    <div className="col-span-2 flex items-center justify-center py-16">
                        <Loader2 size={32} className="text-[#07a0c3] animate-spin" />
                    </div>
                ) : (
                    prizes.map((prize, index) => (
                        <div
                            key={index}
                            className="group relative rounded-[2rem] border border-white/60 bg-white/50 p-6 backdrop-blur-xl shadow-sm transition-all hover:shadow-md"
                        >
                            {/* Color Indicator */}
                            <div
                                className="absolute left-0 top-6 bottom-6 w-1.5 rounded-r-full transition-all"
                                style={{ backgroundColor: prize.color }}
                            />

                            <div className="flex items-start justify-between mb-4">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    Prêmio {index + 1}
                                </span>
                                <button
                                    onClick={() => removePrize(index)}
                                    className="p-2 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Nome do Prêmio</label>
                                    <input
                                        value={prize.label}
                                        onChange={(e) => updatePrize(index, "label", e.target.value)}
                                        placeholder="Ex: 10% OFF"
                                        className="w-full rounded-xl border border-white bg-white/80 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-[#07a0c3] focus:ring-2 focus:ring-[#07a0c3]/20 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Tag do Fiqon</label>
                                    <input
                                        value={prize.trigger_tag}
                                        onChange={(e) => updatePrize(index, "trigger_tag", e.target.value)}
                                        placeholder="Ex: desconto_10"
                                        className="w-full rounded-xl border border-white bg-white/80 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-[#07a0c3] focus:ring-2 focus:ring-[#07a0c3]/20 transition-all"
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-1">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Chance (%)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={prize.chance_percentage}
                                            onChange={(e) => updatePrize(index, "chance_percentage", parseInt(e.target.value) || 0)}
                                            className="w-full rounded-xl border border-white bg-white/80 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-[#07a0c3] focus:ring-2 focus:ring-[#07a0c3]/20 transition-all tabular-nums"
                                        />
                                    </div>
                                    <div className="w-20">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Cor</label>
                                        <input
                                            type="color"
                                            value={prize.color}
                                            onChange={(e) => updatePrize(index, "color", e.target.value)}
                                            className="w-full h-[46px] rounded-xl border border-white bg-white/80 cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between relative z-10">
                <button
                    onClick={addPrize}
                    disabled={!canAdd}
                    className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-white/50 backdrop-blur-xl border border-white/60 text-[#086788] text-[11px] font-black uppercase tracking-widest shadow-sm hover:bg-[#086788] hover:text-white hover:shadow-lg transition-all duration-300 disabled:opacity-40 disabled:hover:bg-white/50 disabled:hover:text-[#086788]"
                >
                    <Plus size={18} />
                    Adicionar Prêmio ({prizes.length}/8)
                </button>

                <button
                    onClick={handleSave}
                    disabled={!isValid || saving}
                    className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {saving ? "Salvando..." : "Salvar Prêmios"}
                </button>
            </div>

            {/* Feedback */}
            {feedback && (
                <div className={`mt-4 p-4 rounded-2xl text-sm font-bold text-center relative z-10 ${feedback.type === "success" ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                    {feedback.message}
                </div>
            )}

            <style>{`
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin-slow { animation: spin-slow 8s linear infinite; }
            `}</style>
        </div>
    );
}
