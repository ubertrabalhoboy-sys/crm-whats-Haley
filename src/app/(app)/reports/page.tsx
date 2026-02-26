"use client";

import { BarChart3, TrendingUp, Filter, ArrowDown } from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid
} from "recharts";

const data = [
    { dia: "Seg", faturamento: 1200, economia: 324 },
    { dia: "Ter", faturamento: 1500, economia: 405 },
    { dia: "Qua", faturamento: 1100, economia: 297 },
    { dia: "Qui", faturamento: 1800, economia: 486 },
    { dia: "Sex", faturamento: 2500, economia: 675 },
    { dia: "Sáb", faturamento: 3100, economia: 837 },
    { dia: "Dom", faturamento: 2800, economia: 756 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/60 backdrop-blur-xl border border-white/50 rounded-2xl p-4 shadow-xl shadow-[#086788]/10">
                <p className="text-sm font-black uppercase tracking-widest text-[#086788] mb-3">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center justify-between gap-6 mb-2 last:mb-0">
                        <span className="text-xs font-bold text-slate-500">{entry.name}:</span>
                        <span className="text-sm font-black" style={{ color: entry.color }}>
                            R$ {entry.value.toFixed(2)}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

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
                            Inteligência de Vendas e Gamificação
                        </h1>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-[#07a0c3]">
                            Análise Avançada de ROI e Conversão
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 px-2 relative z-10">

                {/* Componente 1: O Funil de Conversão */}
                <div className="xl:col-span-1 flex flex-col p-8 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2.5rem]">
                    <h2 className="text-[12px] font-black uppercase tracking-widest text-[#086788] mb-8 flex items-center gap-3">
                        <Filter size={18} className="text-[#07a0c3]" />
                        Funil de Conversão (Roleta)
                    </h2>

                    <div className="flex-1 flex flex-col items-center justify-center py-4">

                        {/* Etapa 1 */}
                        <div className="w-full max-w-[90%] bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl p-5 shadow-lg shadow-indigo-500/20 text-center relative z-10 border border-white/20 transform transition-transform hover:scale-105">
                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-100 mb-1">Acessos na Roleta</p>
                            <p className="text-3xl font-black text-white tracking-tight">1.250</p>
                        </div>

                        {/* Seta e Conversão 1 */}
                        <div className="flex flex-col items-center my-2 relative z-0">
                            <div className="w-1 h-8 bg-gradient-to-b from-indigo-500 to-cyan-400 opacity-50"></div>
                            <div className="absolute top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-md border border-slate-200 text-indigo-600 text-[10px] font-black px-3 py-1 rounded-full shadow-sm">
                                38.4% de Conversão
                            </div>
                        </div>

                        {/* Etapa 2 */}
                        <div className="w-full max-w-[75%] bg-gradient-to-r from-[#07a0c3] to-cyan-500 rounded-2xl p-5 shadow-lg shadow-[#07a0c3]/20 text-center relative z-10 border border-white/20 transform transition-transform hover:scale-105">
                            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-100 mb-1">Leads Capturados (WhatsApp)</p>
                            <p className="text-3xl font-black text-white tracking-tight">480</p>
                        </div>

                        {/* Seta e Conversão 2 */}
                        <div className="flex flex-col items-center my-2 relative z-0">
                            <div className="w-1 h-8 bg-gradient-to-b from-cyan-400 to-emerald-400 opacity-50"></div>
                            <div className="absolute top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-md border border-slate-200 text-cyan-600 text-[10px] font-black px-3 py-1 rounded-full shadow-sm">
                                23.3% de Fechamento
                            </div>
                        </div>

                        {/* Etapa 3 */}
                        <div className="w-full max-w-[55%] bg-gradient-to-r from-emerald-500 to-green-500 rounded-2xl p-5 shadow-lg shadow-emerald-500/20 text-center relative z-10 border border-white/20 transform transition-transform hover:scale-105">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100 mb-1">Vendas Finalizadas</p>
                            <p className="text-3xl font-black text-white tracking-tight">112</p>
                        </div>

                    </div>
                </div>

                {/* Componente 2: Gráfico de Receita vs Economia */}
                <div className="xl:col-span-2 flex flex-col p-8 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2.5rem]">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-[12px] font-black uppercase tracking-widest text-[#086788] flex items-center gap-3">
                            <TrendingUp size={18} className="text-[#07a0c3]" />
                            Receita Gerada vs Economia iFood (7 dias)
                        </h2>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-[#086788]"></div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Faturamento Whats</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-[#07a0c3]"></div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Economia iFood (27%)</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.4} />
                                <XAxis
                                    dataKey="dia"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }}
                                    tickFormatter={(value) => `R$ ${value}`}
                                />
                                <Tooltip cursor={{ fill: 'rgba(7, 160, 195, 0.05)' }} content={<CustomTooltip />} />

                                <Bar
                                    dataKey="faturamento"
                                    name="Faturamento via WhatsApp"
                                    fill="#086788"
                                    radius={[6, 6, 0, 0]}
                                    barSize={40}
                                />
                                <Bar
                                    dataKey="economia"
                                    name="Economia iFood (27%)"
                                    fill="#07a0c3"
                                    radius={[6, 6, 0, 0]}
                                    barSize={40}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>
        </div>
    );
}
