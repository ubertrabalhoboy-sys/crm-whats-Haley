import React from "react";

export default function SectionDashboard() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 gap-x-16 gap-y-16 pl-10 pt-10 pr-10 max-w-7xl items-center my-24 mx-auto text-left relative z-10">
            {/* Texto Seção 2 */}
            <div>
                <div className="bg-green-100 text-green-700 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full w-fit mb-4">
                    📈 Lucro em Tempo Real
                </div>
                <h3 className="text-4xl md:text-5xl font-[900] text-[#0f172a] tracking-tight mb-6 uppercase">
                    CONTROLE TOTAL <br />
                    <span className="text-blue-600">SEM ACHISMOS.</span>
                </h3>
                <p className="leading-relaxed text-lg md:text-xl text-gray-500 mb-8">
                    Nada se perde. Nosso Kanban inteligente organiza leads, pagamentos pendentes e produção. Saiba exatamente quanto o sistema colocou no seu bolso com o Dashboard de ROI automático.
                </p>
                <ul className="space-y-4">
                    {[
                        "Recuperação Automática de Vendas Perdidas",
                        "Kanban de Produção e Cozinha integrado",
                        "Remarketing automático rodando 24h",
                    ].map((text, i) => (
                        <li key={i} className="flex items-center gap-4 text-gray-700 font-semibold">
                            <div className="bg-blue-100 rounded-full p-1 text-blue-600">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M20 6 9 17l-5-5" />
                                </svg>
                            </div>
                            {text}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Card Visual Interativo: Dashboard de ROI */}
            <div className="aspect-square lg:aspect-video overflow-hidden group bg-white/20 backdrop-blur-xl border-white/40 border-2 rounded-[2rem] relative shadow-2xl">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(37,99,235,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.05)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
                <div className="flex overflow-hidden absolute inset-0 perspective-800 items-center justify-center">
                    <div className="relative w-80 bg-[#0f172a] rounded-3xl shadow-2xl transform rotate-x-6 rotate-y-6 flex flex-col p-5 z-10 border border-white/10">
                        <div className="flex justify-between items-center mb-6">
                            <div className="text-xs font-bold text-white uppercase tracking-tighter">
                                Dashboard de Lucro
                            </div>
                            <div className="text-[10px] text-blue-400 font-bold">FEVEREIRO 2024</div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <div className="bg-white/5 border border-white/10 p-3 rounded-2xl">
                                <div className="text-[9px] text-gray-400 uppercase font-bold">ROI Gerado</div>
                                <div className="text-lg font-black text-green-400">482%</div>
                            </div>
                            <div className="bg-white/5 border border-white/10 p-3 rounded-2xl">
                                <div className="text-[9px] text-gray-400 uppercase font-bold">Novos Leads</div>
                                <div className="text-lg font-black text-blue-400">+1.240</div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-600 w-3/4"></div>
                            </div>
                            <div className="flex justify-between text-[9px] font-bold">
                                <span className="text-gray-400 uppercase">Economia em Taxas</span>
                                <span className="text-white">R$ 4.200,00</span>
                            </div>
                        </div>

                        {/* Cursor flutuante (Simulando análise do dono) */}
                        <div className="absolute -bottom-8 -right-8 animate-[cursor-float-2_8s_infinite]">
                            <svg
                                className="w-5 h-5 text-green-500 drop-shadow-lg"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                style={{ transform: "rotate(-25deg)" }}
                            >
                                <path d="M5.5 3.21l10.8 5.4a1 1 0 0 1 .16 1.7l-4.2 2.1 2.1 4.2a1 1 0 0 1-1.8.9l-2.1-4.2-4.2 2.1a1 1 0 0 1-1.45-1.09l1.69-11.11z" />
                            </svg>
                            <div className="ml-3.5 -mt-1 px-2.5 py-1 rounded-full bg-green-500 text-[10px] font-bold text-black shadow-xl whitespace-nowrap">
                                Dono da Operação
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
