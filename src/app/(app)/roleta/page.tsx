"use client";

import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { Plus, Trash2, Save, Loader2, Dices, AlertTriangle, CheckCircle2, Link2, Copy, Check, QrCode, RotateCcw, PartyPopper, X, TrendingUp, BarChart3, Store, Image } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

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
    const { data, isLoading } = useSWR<{ ok: boolean; prizes: Prize[]; restaurantId?: string }>("/api/roleta", fetcher);
    const { data: statsData } = useSWR<{ ok: boolean; stats: { totalSpins: number; weekSpins: number; todaySpins: number; prizeBreakdown: Record<string, number> } }>("/api/roleta/stats", fetcher);
    const stats = statsData?.stats;
    const [prizes, setPrizes] = useState<Prize[]>([]);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
    const [copied, setCopied] = useState(false);

    // Branding
    const { data: brandingData, mutate: mutateBranding } = useSWR<{ ok: boolean; branding: { name: string; logo_url: string; roulette_headline: string } }>("/api/roleta/branding", fetcher);
    const [logoUrl, setLogoUrl] = useState("");
    const [headline, setHeadline] = useState("");
    const [savingBranding, setSavingBranding] = useState(false);
    const [brandingDirty, setBrandingDirty] = useState(false);

    const restaurantId = data?.restaurantId || "";
    const publicUrl = typeof window !== "undefined" && restaurantId
        ? `${window.location.origin}/play/${restaurantId}`
        : "";

    const handleCopy = async () => {
        if (!publicUrl) return;
        await navigator.clipboard.writeText(publicUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    useEffect(() => {
        if (data?.prizes) {
            setPrizes(data.prizes.length > 0 ? data.prizes : []);
        }
    }, [data]);

    useEffect(() => {
        if (brandingData?.branding) {
            setLogoUrl(brandingData.branding.logo_url || "");
            setHeadline(brandingData.branding.roulette_headline || "");
            setBrandingDirty(false);
        }
    }, [brandingData]);

    const handleSaveBranding = async () => {
        setSavingBranding(true);
        try {
            const res = await fetch("/api/roleta/branding", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ logo_url: logoUrl, roulette_headline: headline }),
            });
            const json = await res.json();
            if (json.ok) {
                setBrandingDirty(false);
                mutateBranding();
                setFeedback({ type: "success", message: "Personalização salva!" });
            } else {
                setFeedback({ type: "error", message: json.error || "Erro ao salvar." });
            }
        } catch {
            setFeedback({ type: "error", message: "Erro de conexão." });
        } finally {
            setSavingBranding(false);
            setTimeout(() => setFeedback(null), 3000);
        }
    };

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

            {/* Personalização Card */}
            <div className="mb-6 relative z-10 rounded-[2rem] border border-white/60 bg-white/40 backdrop-blur-xl shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Store size={16} className="text-[#086788]" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#086788]">
                        Personalização da Roleta
                    </span>
                </div>

                <div className="space-y-4">
                    {/* Restaurant Name (read-only) */}
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Nome da Loja</label>
                        <div className="flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
                            <Store size={14} className="text-slate-400" />
                            <span className="text-sm font-bold text-slate-600">{brandingData?.branding?.name || "Carregando..."}</span>
                        </div>
                    </div>

                    {/* Logo URL */}
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">URL do Logo</label>
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <Image size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="url"
                                    value={logoUrl}
                                    onChange={(e) => { setLogoUrl(e.target.value); setBrandingDirty(true); }}
                                    placeholder="https://exemplo.com/logo.png"
                                    className="w-full rounded-xl border border-slate-200 bg-white/80 pl-9 pr-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-[#07a0c3] focus:ring-2 focus:ring-[#07a0c3]/20 transition-all"
                                />
                            </div>
                            {logoUrl && (
                                <div className="w-12 h-12 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
                                    <img src={logoUrl} alt="Logo preview" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                </div>
                            )}
                        </div>
                        <p className="text-[9px] text-slate-400 font-bold mt-1">Cole a URL de uma imagem PNG ou JPG da sua logo.</p>
                    </div>

                    {/* Custom Headline */}
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Título Personalizado</label>
                        <input
                            type="text"
                            value={headline}
                            onChange={(e) => { setHeadline(e.target.value); setBrandingDirty(true); }}
                            placeholder="GIRE & GANHE!"
                            maxLength={100}
                            className="w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-[#07a0c3] focus:ring-2 focus:ring-[#07a0c3]/20 transition-all"
                        />
                        <p className="text-[9px] text-slate-400 font-bold mt-1">Se vazio, usará &quot;GIRE &amp; GANHE!&quot; como padrão.</p>
                    </div>

                    {/* Save */}
                    {brandingDirty && (
                        <button
                            onClick={handleSaveBranding}
                            disabled={savingBranding}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[#086788] text-white hover:bg-[#07a0c3] shadow-md transition-all disabled:opacity-50"
                        >
                            {savingBranding ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            {savingBranding ? 'Salvando...' : 'Salvar Personalização'}
                        </button>
                    )}
                </div>
            </div>

            {/* Stats Card */}
            {stats && stats.totalSpins > 0 && (
                <div className="mb-6 relative z-10 rounded-[2rem] border border-white/60 bg-white/40 backdrop-blur-xl shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <BarChart3 size={16} className="text-[#086788]" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#086788]">
                            Estatísticas da Roleta
                        </span>
                    </div>

                    {/* KPI Row */}
                    <div className="grid grid-cols-3 gap-3 mb-5">
                        <div className="rounded-2xl bg-gradient-to-br from-[#086788] to-[#07a0c3] p-4 text-white text-center shadow-md">
                            <div className="text-3xl font-black tabular-nums">{stats.totalSpins}</div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-white/70 mt-1">Total de Giros</div>
                        </div>
                        <div className="rounded-2xl bg-white/70 border border-white/80 p-4 text-center shadow-sm">
                            <div className="text-3xl font-black tabular-nums text-[#086788]">{stats.weekSpins}</div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">Últimos 7 Dias</div>
                        </div>
                        <div className="rounded-2xl bg-white/70 border border-white/80 p-4 text-center shadow-sm">
                            <div className="flex items-center justify-center gap-1">
                                <div className="text-3xl font-black tabular-nums text-emerald-600">{stats.todaySpins}</div>
                                {stats.todaySpins > 0 && <TrendingUp size={16} className="text-emerald-500" />}
                            </div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">Hoje</div>
                        </div>
                    </div>

                    {/* Prize Breakdown */}
                    {
                        Object.keys(stats.prizeBreakdown).length > 0 && (
                            <div>
                                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Prêmios Distribuídos</div>
                                <div className="space-y-1.5">
                                    {Object.entries(stats.prizeBreakdown)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([prize, count]) => {
                                            const pct = stats.totalSpins > 0 ? Math.round((count / stats.totalSpins) * 100) : 0;
                                            const matchingPrize = prizes.find(p => p.label === prize);
                                            return (
                                                <div key={prize} className="flex items-center gap-3">
                                                    <div
                                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                                        style={{ backgroundColor: matchingPrize?.color || '#94a3b8' }}
                                                    />
                                                    <span className="text-xs font-bold text-slate-600 flex-1 truncate">{prize}</span>
                                                    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full transition-all"
                                                            style={{ width: `${pct}%`, backgroundColor: matchingPrize?.color || '#94a3b8' }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-black text-slate-700 tabular-nums w-10 text-right">{count}×</span>
                                                </div>
                                            );
                                        })
                                    }
                                </div>
                            </div>
                        )
                    }
                </div >
            )
            }

            {/* Link + QR Code Card */}
            {
                publicUrl && prizes.length > 0 && sum === 100 && (
                    <div className="mb-6 relative z-10 rounded-[2rem] border border-white/60 bg-white/40 backdrop-blur-xl shadow-sm p-6">
                        <div className="flex flex-col md:flex-row items-center gap-6">
                            {/* QR Code */}
                            <div className="bg-white rounded-2xl p-4 shadow-inner border border-slate-100 shrink-0">
                                <QRCodeSVG
                                    value={publicUrl}
                                    size={140}
                                    level="M"
                                    bgColor="#ffffff"
                                    fgColor="#086788"
                                />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                    <Link2 size={16} className="text-[#086788]" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-[#086788]">
                                        Link Público da Roleta
                                    </span>
                                </div>
                                <p className="text-slate-500 text-xs font-bold mb-3">
                                    Compartilhe este link com seus clientes ou imprima o QR Code para colocar no balcão/mesa.
                                </p>

                                {/* URL + Copy */}
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-white/80 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 truncate select-all">
                                        {publicUrl}
                                    </div>
                                    <button
                                        onClick={handleCopy}
                                        className={`shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${copied
                                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                            : 'bg-[#086788] text-white hover:bg-[#07a0c3] shadow-md'
                                            }`}
                                    >
                                        {copied ? <Check size={14} /> : <Copy size={14} />}
                                        {copied ? 'Copiado!' : 'Copiar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

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
            {
                feedback && (
                    <div className={`mt-4 p-4 rounded-2xl text-sm font-bold text-center relative z-10 ${feedback.type === "success" ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                        {feedback.message}
                    </div>
                )
            }

            <style>{`
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin-slow { animation: spin-slow 8s linear infinite; }
            `}</style>
        </div >
    );
}
