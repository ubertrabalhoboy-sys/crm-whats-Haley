"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

type Prize = {
    id: string;
    label: string;
    trigger_tag: string;
    chance_percentage: number;
    color: string;
};

function generateConicGradient(prizes: Prize[]) {
    let deg = 0;
    const stops: string[] = [];
    for (const p of prizes) {
        const slice = (p.chance_percentage / 100) * 360;
        stops.push(`${p.color} ${deg}deg ${deg + slice}deg`);
        deg += slice;
    }
    return `conic-gradient(${stops.join(", ")})`;
}

export default function PlayPage({ params }: { params: Promise<{ restaurantId: string }> }) {
    const [restaurantId, setRestaurantId] = useState<string>("");
    const [prizes, setPrizes] = useState<Prize[]>([]);
    const [loading, setLoading] = useState(true);
    const [nome, setNome] = useState("");
    const [whatsapp, setWhatsapp] = useState("");
    const [spinning, setSpinning] = useState(false);
    const [result, setResult] = useState<{ label: string; color: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [currentRotation, setCurrentRotation] = useState(0);
    const wheelRef = useRef<HTMLDivElement>(null);

    // Resolve params
    useEffect(() => {
        params.then(p => setRestaurantId(p.restaurantId));
    }, [params]);

    // Fetch prizes
    useEffect(() => {
        if (!restaurantId) return;
        fetch(`/api/play/${restaurantId}/prizes`)
            .then(r => r.json())
            .then(data => {
                if (data.ok) setPrizes(data.prizes);
                else setError("Roleta não configurada.");
            })
            .catch(() => setError("Erro ao carregar."))
            .finally(() => setLoading(false));
    }, [restaurantId]);

    const canSpin = nome.trim().length >= 2 && whatsapp.replace(/\D/g, "").length >= 10 && !spinning && !result;

    const handleSpin = async () => {
        if (!canSpin) return;
        setSpinning(true);
        setError(null);

        try {
            const res = await fetch(`/api/play/${restaurantId}/spin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nome: nome.trim(), whatsapp: whatsapp.replace(/\D/g, "") }),
            });

            const data = await res.json();

            if (!data.ok) {
                setError(data.error || "Erro no sorteio.");
                setSpinning(false);
                return;
            }

            // Calculate target rotation
            const winnerIndex = data.winnerIndex as number;
            const totalPrizes = data.totalPrizes as number;

            // Calculate the center angle of the winning slice
            let startDeg = 0;
            for (let i = 0; i < winnerIndex; i++) {
                startDeg += (prizes[i].chance_percentage / 100) * 360;
            }
            const sliceDeg = (prizes[winnerIndex].chance_percentage / 100) * 360;
            const sliceCenter = startDeg + sliceDeg / 2;

            // The pointer is at top (0deg). To land on the slice, rotate so sliceCenter ends at top.
            // We spin multiple full rotations + offset
            const fullSpins = 5 * 360; // 5 full rotations
            const targetDeg = currentRotation + fullSpins + (360 - sliceCenter);

            setCurrentRotation(targetDeg);

            if (wheelRef.current) {
                wheelRef.current.style.transition = "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)";
                wheelRef.current.style.transform = `rotate(${targetDeg}deg)`;
            }

            // After animation, show result
            setTimeout(() => {
                setResult({ label: data.prize.label, color: data.prize.color });
                setSpinning(false);
            }, 4200);
        } catch {
            setError("Erro de conexão.");
            setSpinning(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 flex items-center justify-center">
                <Loader2 size={48} className="text-white animate-spin" />
            </div>
        );
    }

    if (prizes.length === 0) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 flex items-center justify-center p-6">
                <p className="text-white/60 text-lg font-bold">Roleta não disponível.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background glow */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-purple-500/20 blur-[150px] rounded-full pointer-events-none" />

            {/* Title */}
            <div className="text-center mb-8 relative z-10">
                <h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter uppercase">
                    Gire e <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">Ganhe!</span>
                </h1>
                <p className="text-white/50 text-sm font-bold mt-2 uppercase tracking-widest">
                    Preencha e tente a sorte
                </p>
            </div>

            {/* Wheel + Pointer */}
            <div className="relative mb-8 z-10">
                {/* Pointer */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                    <div className="w-0 h-0 border-l-[14px] border-r-[14px] border-t-[28px] border-l-transparent border-r-transparent border-t-yellow-400 drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)]" />
                </div>

                {/* Wheel */}
                <div
                    ref={wheelRef}
                    className="w-72 h-72 md:w-80 md:h-80 rounded-full shadow-[0_0_60px_rgba(139,92,246,0.3)] border-4 border-white/20 relative"
                    style={{ background: generateConicGradient(prizes) }}
                >
                    {/* Prize labels on wheel */}
                    {prizes.map((prize, i) => {
                        let startDeg = 0;
                        for (let j = 0; j < i; j++) {
                            startDeg += (prizes[j].chance_percentage / 100) * 360;
                        }
                        const sliceDeg = (prize.chance_percentage / 100) * 360;
                        const labelDeg = startDeg + sliceDeg / 2;
                        return (
                            <div
                                key={prize.id || i}
                                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                style={{ transform: `rotate(${labelDeg}deg)` }}
                            >
                                <span
                                    className="absolute text-white text-[10px] md:text-xs font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] uppercase tracking-wider"
                                    style={{
                                        top: '18%',
                                        transform: 'translateX(-50%)',
                                        maxWidth: '70px',
                                        textAlign: 'center',
                                        lineHeight: '1.2',
                                    }}
                                >
                                    {prize.label}
                                </span>
                            </div>
                        );
                    })}

                    {/* Center dot */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 bg-white rounded-full shadow-xl border-2 border-yellow-400 flex items-center justify-center">
                            <span className="text-[8px] font-black text-purple-900">🎰</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Form */}
            {!result && (
                <div className="w-full max-w-sm space-y-3 relative z-10">
                    <input
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder="Seu nome"
                        disabled={spinning}
                        className="w-full px-5 py-4 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 text-white font-bold placeholder-white/30 outline-none focus:border-yellow-400/60 focus:ring-2 focus:ring-yellow-400/20 transition-all disabled:opacity-50"
                    />
                    <input
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ""))}
                        placeholder="WhatsApp (ex: 5511999999999)"
                        disabled={spinning}
                        className="w-full px-5 py-4 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 text-white font-bold placeholder-white/30 outline-none focus:border-yellow-400/60 focus:ring-2 focus:ring-yellow-400/20 transition-all disabled:opacity-50 tabular-nums"
                    />
                    <button
                        onClick={handleSpin}
                        disabled={!canSpin}
                        className="w-full py-5 rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 text-slate-900 font-black text-lg uppercase tracking-widest shadow-lg shadow-yellow-500/30 hover:shadow-yellow-500/50 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                    >
                        {spinning ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                Girando...
                            </>
                        ) : (
                            "🎰 Girar a Roleta!"
                        )}
                    </button>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="mt-4 px-6 py-3 bg-red-500/20 border border-red-400/30 rounded-2xl text-red-300 text-sm font-bold text-center relative z-10">
                    {error}
                </div>
            )}

            {/* Celebration Modal */}
            {result && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                    <div className="bg-gradient-to-br from-purple-900 to-indigo-900 rounded-[3rem] p-10 max-w-md w-full text-center border border-purple-400/30 shadow-2xl">
                        <div className="text-6xl mb-4">🎉</div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-2">
                            Parabéns!
                        </h2>
                        <p className="text-white/70 text-sm font-bold mb-6">
                            Você ganhou:
                        </p>
                        <div
                            className="inline-block px-8 py-4 rounded-2xl text-white text-2xl font-black uppercase shadow-lg mb-6"
                            style={{ backgroundColor: result.color }}
                        >
                            {result.label}
                        </div>
                        <p className="text-white/50 text-xs font-bold">
                            ✅ Seu prêmio foi enviado para o seu WhatsApp!
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
