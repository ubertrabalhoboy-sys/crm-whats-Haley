"use client";

import { BarChart3, LineChart, PieChart } from "lucide-react";

export default function ReportsPage() {
    return (
        <div className="relative h-full flex flex-col overflow-y-auto custom-scroll w-full px-2 pb-6">
            {/* Pattern de fundo */}
            <div className="pointer-events-none fixed inset-0 opacity-[0.03] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />

            {/* Header */}
            <div className="mb-8 mt-2 flex items-center justify-between rounded-[2.5rem] border border-white/60 bg-white/40 px-8 py-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl relative z-10 shrink-0 mx-2">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#086788] to-[#07a0c3] text-white shadow-lg shadow-[#086788]/20">
                        <BarChart3 size={24} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-[950] uppercase tracking-tighter text-[#086788] leading-none">
                            Relatórios
                        </h1>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-[#07a0c3]">
                            Análise Avançada e Gráficos
                        </p>
                    </div>
                </div>
            </div>

            {/* Charts Grid Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-2 relative z-10">

                {/* Chart 1 Skeleton */}
                <div className="flex flex-col p-8 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2.5rem]">
                    <h2 className="text-[12px] font-black uppercase tracking-widest text-[#086788] mb-6 flex items-center gap-3">
                        <LineChart size={18} className="text-[#07a0c3]" />
                        Volume de Conversas (30 dias)
                    </h2>

                    <div className="h-64 w-full bg-white/50 border-2 border-dashed border-[#086788]/10 rounded-[1.5rem] flex items-center justify-center relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent pointer-events-none" />
                        <div className="flex flex-col items-center gap-2">
                            <LineChart size={32} className="text-slate-300 group-hover:scale-110 transition-transform duration-500" />
                            <span className="text-xs font-bold text-slate-400">Integração de Gráfico Pendente</span>
                        </div>
                    </div>
                </div>

                {/* Chart 2 Skeleton */}
                <div className="flex flex-col p-8 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2.5rem]">
                    <h2 className="text-[12px] font-black uppercase tracking-widest text-[#086788] mb-6 flex items-center gap-3">
                        <PieChart size={18} className="text-[#07a0c3]" />
                        Conversão por Origem
                    </h2>

                    <div className="h-64 w-full bg-white/50 border-2 border-dashed border-[#086788]/10 rounded-[1.5rem] flex items-center justify-center relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-bl from-[#07a0c3]/5 to-transparent pointer-events-none" />
                        <div className="flex flex-col items-center gap-2">
                            <PieChart size={32} className="text-slate-300 group-hover:scale-110 transition-transform duration-500" />
                            <span className="text-xs font-bold text-slate-400">Integração de Gráfico Pendente</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
