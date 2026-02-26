"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";
import confetti from "canvas-confetti";

type Prize = {
    id: string;
    label: string;
    trigger_tag: string;
    chance_percentage: number;
    color: string;
};

// ─── Confetti Fireworks ─────────────────────────────────────────────
function triggerFireworks() {
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };
    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;
    const interval = window.setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);
        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
}

// ─── SVG Roulette Wheel ─────────────────────────────────────────────
function RouletteWheel({ prizes }: { prizes: Prize[] }) {
    const size = 320;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 4; // small padding for border

    const slices: React.ReactNode[] = [];
    let startAngle = 0;

    for (let i = 0; i < prizes.length; i++) {
        const prize = prizes[i];
        const sliceAngle = (prize.chance_percentage / 100) * 360;
        const endAngle = startAngle + sliceAngle;

        // Convert to radians
        const startRad = ((startAngle - 90) * Math.PI) / 180;
        const endRad = ((endAngle - 90) * Math.PI) / 180;

        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);

        const largeArc = sliceAngle > 180 ? 1 : 0;

        const pathData = [
            `M ${cx} ${cy}`,
            `L ${x1} ${y1}`,
            `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
            `Z`,
        ].join(" ");

        // Label position — center of the slice, 60% from center
        const midAngle = startAngle + sliceAngle / 2;
        const labelRad = ((midAngle - 90) * Math.PI) / 180;
        const labelDist = r * 0.62;
        const lx = cx + labelDist * Math.cos(labelRad);
        const ly = cy + labelDist * Math.sin(labelRad);

        slices.push(
            <g key={i}>
                <path d={pathData} fill={prize.color} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
                <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize="11"
                    fontWeight="900"
                    transform={`rotate(${midAngle}, ${lx}, ${ly})`}
                    paintOrder="stroke"
                    stroke="rgba(0,0,0,0.5)"
                    strokeWidth="3"
                    style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
                >
                    {prize.label.length > 12 ? prize.label.slice(0, 12) + "…" : prize.label}
                </text>
            </g>
        );

        startAngle = endAngle;
    }

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-[0_0_40px_rgba(139,92,246,0.25)]">
            {/* Outer glow ring */}
            <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke="url(#ringGlow)" strokeWidth="3" />
            <defs>
                <linearGradient id="ringGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#a855f7" />
                    <stop offset="50%" stopColor="#facc15" />
                    <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
            </defs>
            {slices}
            {/* Center hub */}
            <circle cx={cx} cy={cy} r="22" fill="url(#hubGradient)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
            <defs>
                <radialGradient id="hubGradient">
                    <stop offset="0%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#f59e0b" />
                </radialGradient>
            </defs>
            <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize="18">🎰</text>
        </svg>
    );
}

// ─── Main Page ──────────────────────────────────────────────────────
export default function PlayPage({ params }: { params: Promise<{ restaurantId: string }> }) {
    const [restaurantId, setRestaurantId] = useState("");
    const [prizes, setPrizes] = useState<Prize[]>([]);
    const [loading, setLoading] = useState(true);
    const [nome, setNome] = useState("");
    const [whatsapp, setWhatsapp] = useState("");
    const [spinning, setSpinning] = useState(false);
    const [result, setResult] = useState<{ label: string; color: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [currentRotation, setCurrentRotation] = useState(0);
    const wheelRef = useRef<HTMLDivElement>(null);

    useEffect(() => { params.then(p => setRestaurantId(p.restaurantId)); }, [params]);

    useEffect(() => {
        if (!restaurantId) return;
        fetch(`/api/play/${restaurantId}/prizes`)
            .then(r => r.json())
            .then(data => { if (data.ok) setPrizes(data.prizes); else setError("Roleta não configurada."); })
            .catch(() => setError("Erro ao carregar."))
            .finally(() => setLoading(false));
    }, [restaurantId]);

    const canSpin = nome.trim().length >= 2 && whatsapp.replace(/\D/g, "").length >= 10 && !spinning && !result;

    const handleSpin = useCallback(async () => {
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

            const winnerIndex = data.winnerIndex as number;

            // Calculate winning angle
            let startDeg = 0;
            for (let i = 0; i < winnerIndex; i++) {
                startDeg += (prizes[i].chance_percentage / 100) * 360;
            }
            const sliceDeg = (prizes[winnerIndex].chance_percentage / 100) * 360;
            const sliceCenter = startDeg + sliceDeg / 2;

            const fullSpins = 5 * 360;
            const targetDeg = currentRotation + fullSpins + (360 - sliceCenter);
            setCurrentRotation(targetDeg);

            if (wheelRef.current) {
                wheelRef.current.style.transition = "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)";
                wheelRef.current.style.transform = `rotate(${targetDeg}deg)`;
            }

            setTimeout(() => {
                setResult({ label: data.prize.label, color: data.prize.color });
                setSpinning(false);
                triggerFireworks();
            }, 4200);
        } catch {
            setError("Erro de conexão.");
            setSpinning(false);
        }
    }, [canSpin, restaurantId, nome, whatsapp, prizes, currentRotation]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black flex items-center justify-center">
                <Loader2 size={48} className="text-purple-400 animate-spin" />
            </div>
        );
    }

    if (prizes.length === 0) {
        return (
            <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black flex items-center justify-center p-6">
                <p className="text-white/40 text-lg font-bold">Roleta não disponível.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-purple-600/10 blur-[180px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-amber-500/5 blur-[120px] rounded-full pointer-events-none" />

            {/* Glassmorphism Card */}
            <div className="relative z-10 w-full max-w-md bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] shadow-2xl rounded-[2.5rem] p-8 md:p-10 flex flex-col items-center">

                {/* Title */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase leading-none">
                        Gire e{" "}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500">
                            Ganhe!
                        </span>
                    </h1>
                    <p className="text-white/30 text-[10px] font-bold mt-3 uppercase tracking-[0.3em]">
                        Preencha e tente a sorte
                    </p>
                </div>

                {/* Wheel + Pointer */}
                <div className="relative mb-8">
                    {/* Pointer */}
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20">
                        <div className="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[24px] border-l-transparent border-r-transparent border-t-yellow-400 drop-shadow-[0_4px_12px_rgba(250,204,21,0.5)]" />
                    </div>

                    {/* Spinning container */}
                    <div ref={wheelRef} className="w-72 h-72 md:w-80 md:h-80 flex items-center justify-center">
                        <RouletteWheel prizes={prizes} />
                    </div>
                </div>

                {/* Form */}
                {!result && (
                    <div className="w-full space-y-3">
                        <input
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            placeholder="Seu nome"
                            disabled={spinning}
                            className="w-full px-5 py-4 rounded-2xl bg-white/[0.07] border border-white/[0.1] text-white font-bold placeholder-white/20 outline-none focus:border-purple-400/50 focus:bg-white/[0.1] transition-all disabled:opacity-40"
                        />
                        <input
                            value={whatsapp}
                            onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ""))}
                            placeholder="WhatsApp (ex: 5511999999999)"
                            disabled={spinning}
                            className="w-full px-5 py-4 rounded-2xl bg-white/[0.07] border border-white/[0.1] text-white font-bold placeholder-white/20 outline-none focus:border-purple-400/50 focus:bg-white/[0.1] transition-all disabled:opacity-40 tabular-nums"
                        />

                        {/* Shimmer Spin Button */}
                        <button
                            onClick={handleSpin}
                            disabled={!canSpin}
                            className="relative w-full py-5 rounded-2xl bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 text-slate-900 font-black text-lg uppercase tracking-widest shadow-[0_0_30px_rgba(251,191,36,0.3)] hover:shadow-[0_0_50px_rgba(251,191,36,0.5)] transition-all duration-500 disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-3 overflow-hidden group"
                        >
                            {/* Shimmer overlay */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
                            {spinning ? (
                                <>
                                    <Loader2 size={20} className="animate-spin relative z-10" />
                                    <span className="relative z-10">Girando...</span>
                                </>
                            ) : (
                                <span className="relative z-10">🎰 Girar a Roleta!</span>
                            )}
                        </button>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="mt-4 w-full px-5 py-3 bg-red-500/10 border border-red-400/20 rounded-2xl text-red-400 text-xs font-bold text-center">
                        {error}
                    </div>
                )}
            </div>

            {/* Celebration Modal */}
            {result && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
                    <div className="bg-gradient-to-br from-slate-900/95 to-purple-950/95 rounded-[3rem] p-10 md:p-12 max-w-sm w-full text-center border border-purple-400/20 shadow-[0_0_80px_rgba(168,85,247,0.15)]">
                        <div className="text-7xl mb-5">🎉</div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tight mb-2">
                            Parabéns!
                        </h2>
                        <p className="text-white/40 text-sm font-bold mb-8 uppercase tracking-widest">
                            Você ganhou:
                        </p>
                        <div
                            className="inline-block px-10 py-5 rounded-2xl text-white text-2xl font-black uppercase shadow-[0_10px_40px_rgba(0,0,0,0.3)] mb-8 tracking-tight"
                            style={{ backgroundColor: result.color }}
                        >
                            {result.label}
                        </div>
                        <p className="text-white/30 text-xs font-bold tracking-wide">
                            ✅ Seu prêmio foi enviado para o seu WhatsApp!
                        </p>
                    </div>
                </div>
            )}

            {/* Shimmer animation keyframes */}
            <style>{`
                @keyframes shimmer-pulse {
                    0%, 100% { box-shadow: 0 0 20px rgba(251,191,36,0.2); }
                    50% { box-shadow: 0 0 40px rgba(251,191,36,0.5); }
                }
            `}</style>
        </div>
    );
}
