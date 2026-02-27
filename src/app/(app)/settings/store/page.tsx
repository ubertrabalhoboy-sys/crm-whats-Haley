"use client";

import { useState, useEffect } from "react";
import { Store, MapPin, Truck, KeyRound, ShieldCheck, Save, Loader2 } from "lucide-react";
import useSWR from "swr";

type StoreSettings = {
    store_address: string;
    delivery_price_per_km: number;
    free_delivery_threshold: number;
    pix_key_masked: string | null;
    has_pix_key: boolean;
};

export default function StoreSettingsPage() {
    const fetcher = async (url: string) => {
        const r = await fetch(url);
        const j = await r.json();
        if (!j.ok) throw new Error(j.error);
        return j.settings as StoreSettings;
    };

    const { data, error, isLoading, mutate } = useSWR<StoreSettings>("/api/settings/store", fetcher);

    const [address, setAddress] = useState("");
    const [pricePerKm, setPricePerKm] = useState(0);
    const [freeThreshold, setFreeThreshold] = useState(0);
    const [pixKey, setPixKey] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [pixSaved, setPixSaved] = useState(false);

    useEffect(() => {
        if (data) {
            setAddress(data.store_address);
            setPricePerKm(data.delivery_price_per_km);
            setFreeThreshold(data.free_delivery_threshold);
        }
    }, [data]);

    const handleSaveDelivery = async () => {
        setSaving(true);
        setSaved(false);
        try {
            await fetch("/api/settings/store", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    store_address: address,
                    delivery_price_per_km: pricePerKm,
                    free_delivery_threshold: freeThreshold,
                }),
            });
            setSaved(true);
            mutate();
            setTimeout(() => setSaved(false), 3000);
        } finally {
            setSaving(false);
        }
    };

    const handleSavePix = async () => {
        if (!pixKey.trim()) return;
        setSaving(true);
        setPixSaved(false);
        try {
            await fetch("/api/settings/store", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pix_key: pixKey }),
            });
            setPixKey("");
            setPixSaved(true);
            mutate();
            setTimeout(() => setPixSaved(false), 4000);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="relative h-full flex flex-col overflow-y-auto custom-scroll w-full px-2 pb-6">
            <div className="pointer-events-none fixed inset-0 opacity-[0.03] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />

            {/* Header */}
            <div className="mb-8 mt-2 flex items-center justify-between rounded-[2.5rem] border border-white/60 bg-white/40 dark:bg-slate-900/60 dark:border-white/10 px-8 py-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl relative z-10 shrink-0 mx-2">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#086788] to-[#07a0c3] text-white shadow-lg shadow-[#086788]/20">
                        <Store size={24} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-[950] uppercase tracking-tighter text-[#086788] dark:text-white leading-none">
                            Configurações da Loja
                        </h1>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-[#07a0c3]">
                            Delivery, Frete e Financeiro
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mx-2 relative z-10">
                {/* Card 1 — Delivery */}
                <div className="rounded-[2.5rem] border border-white/60 bg-white/40 dark:bg-slate-900/60 dark:border-white/10 p-8 shadow-lg shadow-[#086788]/5 backdrop-blur-xl">
                    <h2 className="text-lg font-black uppercase tracking-widest text-[#086788] dark:text-white mb-6 flex items-center gap-3">
                        <Truck size={20} className="text-[#07a0c3]" />
                        Delivery
                    </h2>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-12 text-slate-400">
                            <Loader2 size={24} className="animate-spin" />
                        </div>
                    ) : error ? (
                        <p className="text-red-400 text-sm font-bold">Erro ao carregar configurações.</p>
                    ) : (
                        <div className="space-y-5">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                                    <MapPin size={12} /> Endereço da Loja
                                </label>
                                <input
                                    type="text"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="Rua Principal, 123 — Cidade/UF"
                                    className="w-full px-4 py-3 text-sm font-semibold bg-white/60 dark:bg-slate-800/50 border border-white dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#086788]/20 transition-all text-slate-800 dark:text-white"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">
                                        Taxa por KM (R$)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.50"
                                        min="0"
                                        value={pricePerKm}
                                        onChange={(e) => setPricePerKm(Number(e.target.value))}
                                        className="w-full px-4 py-3 text-sm font-semibold bg-white/60 dark:bg-slate-800/50 border border-white dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#086788]/20 transition-all text-slate-800 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">
                                        Frete Grátis Acima de (R$)
                                    </label>
                                    <input
                                        type="number"
                                        step="1"
                                        min="0"
                                        value={freeThreshold}
                                        onChange={(e) => setFreeThreshold(Number(e.target.value))}
                                        className="w-full px-4 py-3 text-sm font-semibold bg-white/60 dark:bg-slate-800/50 border border-white dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#086788]/20 transition-all text-slate-800 dark:text-white"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleSaveDelivery}
                                disabled={saving}
                                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-[#086788] text-white hover:bg-[#07a0c3] shadow-md transition-all disabled:opacity-40"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                Salvar Delivery
                            </button>

                            {saved && (
                                <p className="text-center text-xs font-bold text-emerald-500 animate-pulse">
                                    ✅ Configurações de delivery salvas!
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Card 2 — Financeiro / PIX */}
                <div className="rounded-[2.5rem] border border-white/60 bg-white/40 dark:bg-slate-900/60 dark:border-white/10 p-8 shadow-lg shadow-[#086788]/5 backdrop-blur-xl">
                    <h2 className="text-lg font-black uppercase tracking-widest text-[#086788] dark:text-white mb-6 flex items-center gap-3">
                        <KeyRound size={20} className="text-[#07a0c3]" />
                        Financeiro
                    </h2>

                    <div className="space-y-5">
                        {data?.has_pix_key && (
                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40">
                                <ShieldCheck size={18} className="text-emerald-500" />
                                <div>
                                    <p className="text-xs font-black text-emerald-700 dark:text-emerald-400">Chave PIX Salva com Segurança 🔒</p>
                                    <p className="text-[10px] text-emerald-600 dark:text-emerald-500 font-semibold">
                                        Chave atual: {data.pix_key_masked}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">
                                {data?.has_pix_key ? "Atualizar Chave PIX" : "Cadastrar Chave PIX"}
                            </label>
                            <input
                                type="text"
                                value={pixKey}
                                onChange={(e) => setPixKey(e.target.value)}
                                placeholder="CPF, CNPJ, e-mail ou chave aleatória"
                                className="w-full px-4 py-3 text-sm font-semibold bg-white/60 dark:bg-slate-800/50 border border-white dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#086788]/20 transition-all text-slate-800 dark:text-white"
                            />
                            <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                                Sua chave é criptografada e protegida por RLS do Supabase.
                            </p>
                        </div>

                        <button
                            onClick={handleSavePix}
                            disabled={saving || !pixKey.trim()}
                            className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-500 shadow-md transition-all disabled:opacity-40"
                        >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                            Salvar Chave PIX
                        </button>

                        {pixSaved && (
                            <p className="text-center text-xs font-bold text-emerald-500 animate-pulse">
                                ✅ Chave PIX salva com segurança!
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
