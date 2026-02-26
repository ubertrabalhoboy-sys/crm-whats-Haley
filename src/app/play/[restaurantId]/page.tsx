"use client";

import React, { useState, useEffect } from 'react';
// @ts-ignore
import confetti from 'canvas-confetti';

// --- Funções Auxiliares de Geometria SVG ---
const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: cx + r * Math.cos(angleInRadians),
        y: cy + r * Math.sin(angleInRadians)
    };
};

const getWedgePath = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
    // Fallback seguro: se for 360 graus (ex: apenas 1 prémio cadastrado), desenha um círculo completo
    if (endAngle - startAngle >= 360) {
        return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
    }
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [
        "M", cx, cy,
        "L", start.x, start.y,
        "A", r, r, 0, largeArcFlag, 1, end.x, end.y,
        "Z"
    ].join(" ");
};

const describeTextArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
    // Fallback seguro: se for 360 graus
    if (endAngle - startAngle >= 360) {
        return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r}`;
    }
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, endAngle);
    return [
        "M", start.x, start.y,
        "A", r, r, 0, 0, 1, end.x, end.y
    ].join(" ");
};

// Interface para o tipo de Prémio
interface Prize {
    id: string;
    label: string;
    trigger_tag?: string;
    chance_percentage: number;
    color?: string;
    neonColor?: string;
    iconType?: number;
}

// Array de cores Neon de Fallback
const NEON_COLORS = [
    { color: "#ffea00", neon: "#ffff66" }, // Amarelo
    { color: "#00f0ff", neon: "#66f6ff" }, // Ciano
    { color: "#00ff66", neon: "#66ff99" }, // Verde
    { color: "#b700ff", neon: "#d366ff" }, // Roxo
    { color: "#ff6600", neon: "#ff994d" }, // Laranja
    { color: "#ff003c", neon: "#ff4d79" }, // Vermelho
];

// Fallback de demonstração caso a API falhe
const FALLBACK_SLICES: Prize[] = [
    { id: "0", label: "TENTE DE NOVO", chance_percentage: 10, color: "#ff003c", neonColor: "#ff4d79", iconType: 0 },
    { id: "1", label: "10% OFF", chance_percentage: 20, color: "#ffea00", neonColor: "#ffff66", iconType: 1 },
    { id: "2", label: "20% OFF", chance_percentage: 30, color: "#00f0ff", neonColor: "#66f6ff", iconType: 2 },
    { id: "3", label: "FRETE GRÁTIS", chance_percentage: 40, color: "#00ff66", neonColor: "#66ff99", iconType: 3 },
];

// --- Efeitos de Confete (Vitória) ---
const fireConfetti = () => {
    const scalar = 2;
    const triangle = confetti.shapeFromPath({ path: "M0 10 L5 0 L10 10z" });
    const square = confetti.shapeFromPath({ path: "M0 0 L10 0 L10 10 L0 10 Z" });
    const coin = confetti.shapeFromPath({ path: "M5 0 A5 5 0 1 0 5 10 A5 5 0 1 0 5 0 Z" });
    const tree = confetti.shapeFromPath({ path: "M5 0 L10 10 L0 10 Z" });

    const defaultsShapes = { spread: 360, ticks: 60, gravity: 0, decay: 0.96, startVelocity: 20, shapes: [triangle, square, coin, tree], scalar };

    const shootShapes = () => {
        confetti({ ...defaultsShapes, particleCount: 30 });
        confetti({ ...defaultsShapes, particleCount: 5 });
        confetti({ ...defaultsShapes, particleCount: 15, scalar: scalar / 2, shapes: ["circle"] });
    };

    const defaultsStars = { spread: 360, ticks: 50, gravity: 0, decay: 0.94, startVelocity: 30, colors: ["#FFE400", "#FFBD00", "#E89400", "#FFCA6C", "#FDFFB8"] };

    const shootStars = () => {
        confetti({ ...defaultsStars, particleCount: 40, scalar: 1.2, shapes: ["star"] });
        confetti({ ...defaultsStars, particleCount: 10, scalar: 0.75, shapes: ["circle"] });
    };

    setTimeout(() => { shootShapes(); shootStars(); }, 0);
    setTimeout(() => { shootShapes(); shootStars(); }, 100);
    setTimeout(() => { shootShapes(); shootStars(); }, 200);

    const end = Date.now() + 3 * 1000;
    const colorsCannons = ["#a786ff", "#fd8bbc", "#eca184", "#f8deb1"];

    const frame = () => {
        if (Date.now() > end) return;
        confetti({ particleCount: 2, angle: 60, spread: 55, startVelocity: 60, origin: { x: 0, y: 0.5 }, colors: colorsCannons });
        confetti({ particleCount: 2, angle: 120, spread: 55, startVelocity: 60, origin: { x: 1, y: 0.5 }, colors: colorsCannons });
        requestAnimationFrame(frame);
    };
    frame();
};

// --- Ícones em SVG inline focados em Desconto e Comida ---
const renderIcon = (type: number) => {
    const props = { stroke: "white", strokeWidth: "2.5", fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, filter: "url(#glowIcon)" };
    switch (type) {
        case 0: return <g {...props}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></g>;
        case 3: return <g {...props}><path d="M4 16h16" /><path d="M12 16a8 8 0 0 0-8-8h16a8 8 0 0 0-8 8z" /><path d="M12 8v-2" /><path d="M10 6h4" /></g>;
        case 5: return <g {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></g>;
        default: return <g {...props}><rect x="2" y="7" width="20" height="10" rx="2" /><path d="M7 12h10" strokeDasharray="2 2" /><path d="M2 12a2 2 0 0 1 0-4" /><path d="M22 12a2 2 0 0 0 0-4" /></g>;
    }
};

// Usar 'any' nos parâmetros para evitar conflitos de tipagem rígida entre Next 14 e Next 15
export default function RoletaPremiumPage({ params }: any) {
    const [restaurantId, setRestaurantId] = useState<string>("");
    const [slices, setSlices] = useState<Prize[]>([]);
    const [rotation, setRotation] = useState(0);
    const [isSpinning, setIsSpinning] = useState(false);
    const [winner, setWinner] = useState<Prize | null>(null);
    const [showModal, setShowModal] = useState(true);
    const [hasRegistered, setHasRegistered] = useState(false);
    const [formData, setFormData] = useState({ name: '', whatsapp: '' });

    // Desempacotamento seguro e universal dos parâmetros da rota
    useEffect(() => {
        async function unwrapParams() {
            if (!params) return;
            try {
                const resolvedParams = await params;
                if (resolvedParams?.restaurantId) {
                    setRestaurantId(resolvedParams.restaurantId);
                }
            } catch (err) {
                console.error("Erro ao resolver params:", err);
            }
        }
        unwrapParams();
    }, [params]);

    // Buscar os prémios à API e injetar Cores Neon caso falte
    useEffect(() => {
        if (!restaurantId) return;

        const fetchPrizes = async () => {
            try {
                const res = await fetch(`/api/play/${restaurantId}/prizes`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.ok && data.prizes && data.prizes.length > 0) {
                        const formattedSlices = data.prizes.map((prize: any, index: number) => {
                            const theme = NEON_COLORS[index % NEON_COLORS.length];
                            return {
                                id: prize.id,
                                label: prize.label,
                                trigger_tag: prize.trigger_tag,
                                chance_percentage: prize.chance_percentage,
                                color: prize.color || theme.color,
                                neonColor: theme.neon,
                                iconType: prize.label.toLowerCase().includes('tente') ? 0 : (index % 5) + 1
                            };
                        });
                        setSlices(formattedSlices);
                        return;
                    }
                }
                throw new Error("Sem dados na BD");
            } catch (err) {
                console.log("Falha ao carregar prémios da BD. A usar fallback de demonstração.");
                setSlices(FALLBACK_SLICES);
            }
        };
        fetchPrizes();
    }, [restaurantId]);

    // Emojis da borda
    const foodEmojis = ['🍔', '🍕', '🍟', '🛵'];
    const borderDecorations = Array.from({ length: 24 }).map((_, i) => {
        const angle = i * 15;
        const pos = polarToCartesian(250, 250, 238, angle);
        return (
            <text
                key={`emoji-${i}`} x={pos.x} y={pos.y} fontSize="15" textAnchor="middle" dominantBaseline="central"
                transform={`rotate(${angle + 90}, ${pos.x}, ${pos.y})`}
                className="opacity-80" filter="url(#glowIcon)"
            >
                {foodEmojis[i % 4]}
            </text>
        );
    });

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.whatsapp || isSpinning || slices.length === 0) return;

        setShowModal(false);
        setHasRegistered(true);
        setIsSpinning(true);
        setWinner(null);

        try {
            // POST PARA O BACKEND FAZER O SORTEIO INVISÍVEL
            let winningIndex = 0;

            const res = await fetch(`/api/play/${restaurantId}/spin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nome: formData.name, whatsapp: formData.whatsapp }),
            });

            const data = await res.json();

            // Anti-fraude: WhatsApp já participou
            if (res.status === 403 || data.error === "already_played") {
                setIsSpinning(false);
                setShowModal(true);
                setHasRegistered(false);
                alert(data.message || "Este WhatsApp já participou desta promoção!");
                return;
            }

            if (!res.ok || !data.ok) {
                setIsSpinning(false);
                setShowModal(true);
                setHasRegistered(false);
                alert(data.message || data.error || "Erro no sorteio. Tente novamente.");
                return;
            }

            winningIndex = data.winnerIndex;

            const wonSlice = slices[winningIndex];

            // MATEMÁTICA DAS FATIAS (Tamanho igual visualmente)
            const sliceAngle = 360 / slices.length;
            const winningCenter = (winningIndex * sliceAngle) + (sliceAngle / 2);
            const targetRotation = 360 - winningCenter; // Rotação para a fatia ficar no topo

            const currentMod = rotation % 360;
            let diff = targetRotation - currentMod;
            if (diff < 0) diff += 360;

            const extraSpins = 360 * 6; // 6 voltas completas de emoção
            const newRotation = rotation + extraSpins + diff;

            setRotation(newRotation);

            // Esperar que a animação CSS termine
            setTimeout(() => {
                setIsSpinning(false);
                setWinner(wonSlice);

                // Se não for o prémio "Tente de novo" (iconType 0), dispara confetes!
                if (wonSlice.iconType !== 0) {
                    fireConfetti();
                }
            }, 6000);

        } catch (error) {
            console.error("Erro na API:", error);
            setIsSpinning(false);
            setShowModal(true);
            alert("Falha de ligação. Tente novamente.");
        }
    };

    const handleSpinClick = () => {
        if (isSpinning) return;
        if (!hasRegistered) setShowModal(true);
    };

    // Previne renderização até que haja fatias processadas
    if (slices.length === 0) return <div className="min-h-screen flex items-center justify-center bg-[#0a0f18] text-white">A preparar a roleta...</div>;

    const sliceAngle = 360 / slices.length;

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0f18] relative overflow-hidden font-sans">

            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes pulse-neon {
          0%, 100% { filter: drop-shadow(0 0 15px rgba(249, 115, 22, 0.5)); }
          50% { filter: drop-shadow(0 0 30px rgba(249, 115, 22, 0.9)) drop-shadow(0 0 50px rgba(255, 0, 100, 0.4)); }
        }
        @keyframes spin-slow {
          100% { transform: rotate(360deg); }
        }
        .energy-core {
          animation: spin-slow 15s linear infinite;
          transform-origin: center;
        }
      `}} />

            {/* Background de Fundo - Estilo Hamburgueria Dark */}
            <div
                className="absolute inset-0 z-0 opacity-40 blur-[3px] scale-110 mix-blend-luminosity"
                style={{ backgroundImage: "url('https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=2000&auto=format&fit=crop')", backgroundSize: 'cover', backgroundPosition: 'center' }}
            ></div>

            {/* Gradientes radiantes */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-orange-600/20 to-purple-600/20 rounded-full blur-[100px] z-0 pointer-events-none"></div>

            {/* Caixa de Mensagem do Ganhador */}
            <div className={`absolute top-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-[800ms] transform ${winner ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-12 scale-90 pointer-events-none'}`}>
                <div className="bg-white/10 backdrop-blur-xl px-10 py-5 rounded-3xl text-white font-extrabold text-2xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.6),_inset_0_0_20px_rgba(255,255,255,0.1)] text-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                    <span className="opacity-80 text-lg font-medium">{winner?.iconType === 0 ? "Que pena! Mais sorte na próxima." : "Você ativou o benefício:"}</span> <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ffea00] to-[#ff003c] uppercase text-4xl tracking-widest drop-shadow-[0_0_10px_rgba(255,0,60,0.5)]">
                        {winner?.label}
                    </span>
                </div>
            </div>

            {/* Painel Glassmorphism Atrás da Roleta */}
            <div className="relative z-10 p-4 sm:p-8 rounded-[3rem] bg-white/5 backdrop-blur-3xl border border-white/10 shadow-[20px_20px_60px_#04060a,_-20px_-20px_60px_#101826]">

                {/* Container Principal da Roleta */}
                <div className="relative w-[320px] h-[320px] sm:w-[450px] sm:h-[450px] flex flex-col items-center">

                    {/* Ponteiro Superior Neumórfico / Neon */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[20px] z-30 filter drop-shadow-[0_10px_15px_rgba(255,100,0,0.8)]">
                        <svg width="50" height="60" viewBox="0 0 40 50">
                            <polygon points="0,0 40,0 20,40" fill="url(#pointerNeon)" stroke="white" strokeWidth="2" />
                            <polygon points="10,5 30,5 20,30" fill="rgba(255,255,255,0.6)" />
                            <defs>
                                <linearGradient id="pointerNeon" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#ffea00" />
                                    <stop offset="100%" stopColor="#ff003c" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>

                    {/* SVG da Roleta que irá girar */}
                    <div
                        className="w-full h-full rounded-full shadow-[0_0_80px_rgba(0,0,0,0.8),_inset_0_0_40px_rgba(255,255,255,0.1)]"
                        style={{
                            transform: `rotate(${rotation}deg)`,
                            transition: 'transform 6s cubic-bezier(0.2, 0.9, 0.1, 1)'
                        }}
                    >
                        <svg viewBox="0 0 500 500" className="w-full h-full" overflow="visible">
                            <defs>
                                <path id="textArc" d={describeTextArc(250, 250, 192, -(sliceAngle / 2), (sliceAngle / 2))} />

                                <filter id="energyNoise">
                                    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise">
                                        <animate attributeName="baseFrequency" values="0.04;0.05;0.04" dur="4s" repeatCount="indefinite" />
                                    </feTurbulence>
                                    <feColorMatrix type="matrix" values="1 0 0 0 1   0 0.3 0 0 0.3   0 0 0 0 0   0 0 0 3 -1" result="coloredNoise" />
                                    <feComposite operator="in" in="coloredNoise" in2="SourceGraphic" result="composite" />
                                    <feBlend mode="screen" in="composite" in2="SourceGraphic" />
                                </filter>

                                <filter id="glowIcon" x="-50%" y="-50%" width="200%" height="200%">
                                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                    <feMerge>
                                        <feMergeNode in="coloredBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>

                                <radialGradient id="glossHighlight" cx="30%" cy="30%" r="60%">
                                    <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                                    <stop offset="50%" stopColor="rgba(255,255,255,0.05)" />
                                    <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                                </radialGradient>

                                <linearGradient id="metalRing" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#1e293b" />
                                    <stop offset="50%" stopColor="#334155" />
                                    <stop offset="100%" stopColor="#0f172a" />
                                </linearGradient>
                            </defs>

                            <circle cx="250" cy="250" r="248" fill="url(#metalRing)" stroke="#475569" strokeWidth="2" />
                            <circle cx="250" cy="250" r="240" fill="none" stroke="#000" strokeWidth="6" opacity="0.6" />

                            <g>{borderDecorations}</g>

                            <circle cx="250" cy="250" r="225" fill="#0f172a" />

                            {/* Fatias Coloridas Dinâmicas (Tamanho igual para todas) */}
                            <g id="slices">
                                {slices.map((slice, i) => {
                                    const startAngle = (i * sliceAngle) - (sliceAngle / 2);
                                    const endAngle = (i * sliceAngle) + (sliceAngle / 2);
                                    return (
                                        <path
                                            key={`slice-${i}`}
                                            d={getWedgePath(250, 250, 155, startAngle, endAngle)}
                                            fill={slice.color}
                                        />
                                    );
                                })}
                            </g>

                            <circle cx="250" cy="250" r="155" fill="url(#glossHighlight)" pointerEvents="none" />

                            {/* Linhas Separadoras */}
                            <g id="lines">
                                {slices.length > 1 && slices.map((_, i) => {
                                    const angle = (i * sliceAngle) - (sliceAngle / 2);
                                    const innerPt = polarToCartesian(250, 250, 45, angle);
                                    const outerPt = polarToCartesian(250, 250, 225, angle);
                                    return (
                                        <line
                                            key={`line-${i}`} x1={innerPt.x} y1={innerPt.y} x2={outerPt.x} y2={outerPt.y}
                                            stroke="#020617" strokeWidth="6" strokeLinecap="round" filter="drop-shadow(0 0 2px rgba(0,0,0,0.8))"
                                        />
                                    );
                                })}
                            </g>

                            {/* Textos Curvados e Ícones das Fatias */}
                            <g id="content">
                                {slices.map((slice, i) => {
                                    return (
                                        <g key={`content-${i}`} transform={`rotate(${i * sliceAngle}, 250, 250)`}>
                                            <text fontSize="22" fontWeight="900" fontFamily="sans-serif" letterSpacing="1" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.8))">
                                                {slice.iconType === 0 ? (
                                                    <textPath href="#textArc" startOffset="50%" textAnchor="middle">
                                                        <tspan fill="white">TENTE </tspan>
                                                        <tspan fill={slice.neonColor}>DE NOVO</tspan>
                                                    </textPath>
                                                ) : (
                                                    <textPath href="#textArc" startOffset="50%" textAnchor="middle" fill="white">
                                                        {slice.label}
                                                    </textPath>
                                                )}
                                            </text>

                                            <g transform={`translate(238, 132)`}>
                                                {renderIcon(slice.iconType || 1)}
                                            </g>
                                        </g>
                                    );
                                })}
                            </g>

                            <circle cx="250" cy="250" r="225" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.3" />
                            <circle cx="250" cy="250" r="155" fill="none" stroke="#fff" strokeWidth="3" opacity="0.4" filter="drop-shadow(0 0 10px rgba(255,255,255,0.8))" />

                            {/* Centro de Energia */}
                            <g>
                                <circle cx="250" cy="250" r="50" fill="#000" opacity="0.6" filter="blur(4px)" />
                                <circle cx="250" cy="250" r="48" fill="#0f172a" stroke="#ff6600" strokeWidth="3" />
                                <circle cx="250" cy="250" r="45" fill="#ff6600" filter="url(#energyNoise)" className="energy-core" />
                                <circle cx="250" cy="250" r="45" fill="url(#glossHighlight)" />
                                <text
                                    x="250" y="268" fill="#ffffff" fontSize="50" fontWeight="900" textAnchor="middle" fontFamily="sans-serif"
                                    filter="drop-shadow(0 0 8px rgba(255,255,255,0.9))"
                                >
                                    %
                                </text>
                            </g>
                        </svg>
                    </div>

                    <button
                        onClick={handleSpinClick}
                        disabled={isSpinning}
                        style={{ animation: isSpinning ? 'none' : 'pulse-neon 2s infinite' }}
                        className="absolute -bottom-12 z-30 px-14 py-4 rounded-full text-white font-black text-2xl uppercase tracking-[0.2em] 
                       bg-gradient-to-br from-[#ff6600] to-[#ff003c] 
                       shadow-[10px_10px_20px_rgba(0,0,0,0.6),_-5px_-5px_15px_rgba(255,255,255,0.1),_inset_0_4px_10px_rgba(255,255,255,0.4),_inset_0_-4px_10px_rgba(0,0,0,0.3)] 
                       border-[1px] border-white/20 backdrop-blur-md
                       hover:scale-110 active:scale-95 transition-all duration-300
                       disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:filter-none"
                    >
                        Girar
                    </button>
                </div>
            </div>

            {/* Modal de Captura de Dados (Formulário) */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-md"></div>

                    <div className="relative bg-white/10 backdrop-blur-2xl border border-white/20 shadow-[0_15px_50px_rgba(0,0,0,0.6),_inset_0_0_20px_rgba(255,255,255,0.05)] rounded-[2rem] p-8 w-full max-w-md">

                        <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#ffea00] to-[#ff003c] mb-3 text-center drop-shadow-[0_0_15px_rgba(255,0,60,0.6)]">
                            GIRE & GANHE!
                        </h2>
                        <p className="text-white text-center mb-8 font-medium leading-relaxed drop-shadow-md text-lg">
                            Preenche os dados abaixo para destravar a roleta. <br />
                            <span className="text-[#00ff66] font-extrabold block mt-2 text-xl drop-shadow-[0_0_8px_rgba(0,255,102,0.4)]">
                                O teu prémio será enviado no WhatsApp! 📲
                            </span>
                        </p>

                        <form onSubmit={handleFormSubmit} className="space-y-5">
                            <div>
                                <label className="block text-white/90 text-sm font-bold mb-1.5 ml-1 drop-shadow-sm">Nome Completo</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-black/20 backdrop-blur-md border border-white/20 rounded-xl px-4 py-3.5 text-white placeholder-white/40 focus:outline-none focus:border-[#ff6600] focus:ring-1 focus:ring-[#ff6600] transition-all shadow-inner"
                                    placeholder="Ex: João da Silva"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-white/90 text-sm font-bold mb-1.5 ml-1 drop-shadow-sm">WhatsApp</label>
                                <input
                                    type="tel"
                                    required
                                    className="w-full bg-black/20 backdrop-blur-md border border-white/20 rounded-xl px-4 py-3.5 text-white placeholder-white/40 focus:outline-none focus:border-[#ff6600] focus:ring-1 focus:ring-[#ff6600] transition-all shadow-inner"
                                    placeholder="(11) 99999-9999"
                                    value={formData.whatsapp}
                                    onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full mt-8 py-4 rounded-xl text-white font-black text-xl uppercase tracking-wider bg-gradient-to-r from-[#ff6600] to-[#ff003c] shadow-[0_10px_20px_rgba(255,0,60,0.4)] hover:scale-[1.03] active:scale-[0.97] transition-all border border-white/20"
                            >
                                Destravar e Girar
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}