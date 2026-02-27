"use client";

import { useState, useEffect } from "react";
import { Store, MapPin, Truck, KeyRound, ShieldCheck, Save, Loader2, Clock } from "lucide-react";
import useSWR from "swr";

type DayHours = { open: string; close: string; isClosed: boolean };
type OperatingHours = Record<string, DayHours>;

type StoreSettings = {
    store_address: string;
    delivery_price_per_km: number;
    free_delivery_threshold: number;
    pix_key_masked: string | null;
    has_pix_key: boolean;
    operating_hours: OperatingHours;
};

const defaultHours: OperatingHours = {
    segunda: { open: "18:00", close: "23:00", isClosed: false },
    terca: { open: "18:00", close: "23:00", isClosed: false },
    quarta: { open: "18:00", close: "23:00", isClosed: false },
    quinta: { open: "18:00", close: "23:00", isClosed: false },
    sexta: { open: "18:00", close: "23:59", isClosed: false },
    sabado: { open: "18:00", close: "23:59", isClosed: false },
    domingo: { open: "18:00", close: "23:00", isClosed: false },
};

const daysOrder = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
const daysLabels: Record<string, string> = {
    segunda: "Segunda-feira",
    terca: "Terça-feira",
    quarta: "Quarta-feira",
    quinta: "Quinta-feira",
    sexta: "Sexta-feira",
    sabado: "Sábado",
    domingo: "Domingo"
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

    // PIX States
    const [pixKey, setPixKey] = useState("");
    const [pixPassword, setPixPassword] = useState("");
    const [pixError, setPixError] = useState("");

    // Hours State
    const [hours, setHours] = useState<OperatingHours>(defaultHours);

    // Save states
    const [savingDelivery, setSavingDelivery] = useState(false);
    const [savedDelivery, setSavedDelivery] = useState(false);

    const [savingPix, setSavingPix] = useState(false);
    const [savedPix, setSavedPix] = useState(false);

    const [savingHours, setSavingHours] = useState(false);
    const [savedHours, setSavedHours] = useState(false);

    useEffect(() => {
        if (data) {
            setAddress(data.store_address);
            setPricePerKm(data.delivery_price_per_km);
            setFreeThreshold(data.free_delivery_threshold);
            if (data.operating_hours && Object.keys(data.operating_hours).length > 0) {
                setHours((prev) => ({ ...prev, ...data.operating_hours }));
            }
        }
    }, [data]);

    const handleSaveDelivery = async () => {
        setSavingDelivery(true);
        setSavedDelivery(false);
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
            setSavedDelivery(true);
            mutate();
            setTimeout(() => setSavedDelivery(false), 3000);
        } finally {
            setSavingDelivery(false);
        }
    };

    const handleSavePix = async () => {
        if (!pixKey.trim() || !pixPassword.trim()) {
            setPixError("Preencha a chave e a sua senha atual.");
            return;
        }
        setSavingPix(true);
        setSavedPix(false);
        setPixError("");
        try {
            const res = await fetch("/api/settings/store", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pix_key: pixKey, password: pixPassword }),
            });
            const j = await res.json();

            if (!j.ok) {
                setPixError(j.error === "INVALID_PASSWORD" ? "Senha incorreta." : "Erro ao salvar PIX.");
                return;
            }

            setPixKey("");
            setPixPassword("");
            setSavedPix(true);
            mutate();
            setTimeout(() => setSavedPix(false), 4000);
        } finally {
            setSavingPix(false);
        }
    };

    const handleSaveHours = async () => {
        setSavingHours(true);
        setSavedHours(false);
        try {
            await fetch("/api/settings/store", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ operating_hours: hours }),
            });
            setSavedHours(true);
            mutate();
            setTimeout(() => setSavedHours(false), 3000);
        } finally {
            setSavingHours(false);
        }
    };

    const updateHour = (day: string, field: keyof DayHours, value: any) => {
        setHours(prev => ({
            ...prev,
            [day]: { ...prev[day], [field]: value }
        }));
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
                                disabled={savingDelivery}
                                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-[#086788] text-white hover:bg-[#07a0c3] shadow-md transition-all disabled:opacity-40"
                            >
                                {savingDelivery ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                Salvar Delivery
                            </button>

                            {savedDelivery && (
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
                                        Chave atual protegida: {data.pix_key_masked}
                                    </p>
                                </div>
                            </div>
                        )}

                        {pixError && (
                            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold">
                                {pixError}
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">
                                {data?.has_pix_key ? "Nova Chave PIX" : "Cadastrar Chave PIX"}
                            </label>
                            <input
                                type="text"
                                value={pixKey}
                                onChange={(e) => setPixKey(e.target.value)}
                                placeholder="CPF, CNPJ, e-mail ou chave aleatória"
                                className="w-full px-4 py-3 text-sm font-semibold bg-white/60 dark:bg-slate-800/50 border border-white dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#086788]/20 transition-all text-slate-800 dark:text-white mb-4"
                            />

                            <label className="text-[10px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400 mb-2 block">
                                Confirme sua Senha de Login
                            </label>
                            <input
                                type="password"
                                value={pixPassword}
                                onChange={(e) => setPixPassword(e.target.value)}
                                placeholder="Digite sua senha para confirmar"
                                className="w-full px-4 py-3 text-sm font-semibold bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all text-slate-800 dark:text-white"
                            />

                            <p className="text-[10px] text-slate-400 mt-2 font-medium">
                                Esta alteração requer validação criptográfica protegida por RLS.
                            </p>
                        </div>

                        <button
                            onClick={handleSavePix}
                            disabled={savingPix || !pixKey.trim() || !pixPassword.trim()}
                            className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-500 shadow-md transition-all disabled:opacity-40"
                        >
                            {savingPix ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                            Salvar Chave PIX
                        </button>

                        {savedPix && (
                            <p className="text-center text-xs font-bold text-emerald-500 animate-pulse">
                                ✅ Chave PIX protegida salva com sucesso!
                            </p>
                        )}
                    </div>
                </div>

                {/* Card 3 — Operating Hours */}
                <div className="lg:col-span-2 rounded-[2.5rem] border border-white/60 bg-white/40 dark:bg-slate-900/60 dark:border-white/10 p-8 shadow-lg shadow-[#086788]/5 backdrop-blur-xl mb-10">
                    <h2 className="text-lg font-black uppercase tracking-widest text-[#086788] dark:text-white mb-6 flex items-center gap-3">
                        <Clock size={20} className="text-[#07a0c3]" />
                        Horários de Funcionamento
                    </h2>

                    <div className="space-y-4 mb-6">
                        {daysOrder.map(day => {
                            const config = hours[day];
                            return (
                                <div key={day} className={`flex items-center justify-between p-4 rounded-2xl border transition-colors ${config.isClosed ? 'bg-slate-100/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800' : 'bg-white/60 dark:bg-slate-800/60 border-indigo-100 dark:border-indigo-500/20 block'}`}>
                                    <div className="flex items-center gap-4 w-48">
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={!config.isClosed}
                                                onChange={(e) => updateHour(day, 'isClosed', !e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                        </label>
                                        <span className={`font-bold capitalize text-sm ${config.isClosed ? 'text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                            {daysLabels[day]}
                                        </span>
                                    </div>

                                    {!config.isClosed ? (
                                        <div className="flex items-center gap-3 flex-1 justify-end">
                                            <input
                                                type="time"
                                                value={config.open}
                                                onChange={(e) => updateHour(day, 'open', e.target.value)}
                                                className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/30"
                                            />
                                            <span className="text-slate-400 font-bold text-xs">até</span>
                                            <input
                                                type="time"
                                                value={config.close}
                                                onChange={(e) => updateHour(day, 'close', e.target.value)}
                                                className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/30"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex-1 text-right text-xs font-bold text-slate-400 uppercase tracking-widest">
                                            Fechado
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={handleSaveHours}
                            disabled={savingHours}
                            className="flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-40"
                        >
                            {savingHours ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Salvar Horários
                        </button>
                    </div>
                    {savedHours && (
                        <p className="text-right mt-3 text-xs font-bold text-emerald-500 animate-pulse">
                            ✅ Horários de funcionamento salvos e sincronizados com a IA!
                        </p>
                    )}
                </div>
            </div>

            {/* Custom Scroll para o Sidebar / Listas Internas */}
            <style>{`
                .custom-scroll::-webkit-scrollbar { width: 6px; }
                .custom-scroll::-webkit-scrollbar-thumb { background: #07a0c3; border-radius: 10px; opacity: 0.5; }
                .custom-scroll::-webkit-scrollbar-track { background: transparent; }
            `}</style>
        </div>
    );
}
