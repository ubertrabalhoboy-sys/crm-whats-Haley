"use client";

import { BarChart3, TrendingUp, Filter, ArrowDown, Award, TrendingDown } from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Legend
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

const topProdutos = [
    { nome: "Combo Família Premium", vendas: 45, faturamento: 3820, percentual: 90 },
    { nome: "Hambúrguer Duplo Cheddar", vendas: 38, faturamento: 1330, percentual: 75 },
    { type: "divider" },
    { nome: "Milkshake Morango", vendas: 4, faturamento: 60, percentual: 10 },
    { nome: "Porção Batata P", vendas: 2, faturamento: 30, percentual: 5 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/80 backdrop-blur-xl border border-white/50 rounded-2xl p-4 shadow-xl shadow-[#086788]/10">
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
        <div className="w-full h-full overflow-y-auto custom-scroll p-4 relative">
            {/* Pattern de fundo */}
            <div className="pointer-events-none fixed inset-0 opacity-[0.03] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />

            {/* Header */}
            <div className="mb-8 flex items-center justify-between rounded-[2.5rem] border border-white/60 bg-white/40 px-8 py-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl relative z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#086788] to-[#07a0c3] text-white shadow-lg shadow-[#086788]/20 animate-fade-in-up">
                        <BarChart3 size={24} />
                    </div>
                    <div className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                        <h1 className="text-3xl font-[950] uppercase tracking-tighter text-[#086788] leading-none">
                            Inteligência de Vendas e Gamificação
                        </h1>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-[#07a0c3]">
                            Métricas de conversão e economia
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 relative z-10">
                {/* Componente 1: O Funil de Conversão */}
                <div className="xl:col-span-1 flex flex-col p-8 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2.5rem] animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                    <h2 className="text-[12px] font-black uppercase tracking-widest text-[#086788] mb-8 flex items-center gap-3">
                        <Filter size={18} className="text-[#07a0c3]" />
                        Funil de Conversão
                    </h2>

                    <div className="flex-1 flex flex-col items-center justify-center py-4 w-full">
                        {/* Etapa 1 */}
                        <div className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl p-5 shadow-lg shadow-indigo-500/20 text-center relative z-10 border border-white/20 transform transition-transform hover:scale-105">
                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-100 mb-1">Acessos na Roleta</p>
                            <p className="text-3xl font-black text-white tracking-tight">1.250</p>
                        </div>

                        {/* Seta e Conversão 1 */}
                        <div className="flex flex-col items-center my-2 relative z-0 w-full">
                            <div className="w-1 h-8 bg-gradient-to-b from-indigo-500 to-[#07a0c3] opacity-50"></div>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-md border border-slate-200 text-indigo-600 text-[10px] font-black px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
                                38.4% Conversão
                            </div>
                        </div>

                        {/* Etapa 2 */}
                        <div className="w-10/12 bg-gradient-to-r from-[#07a0c3] to-cyan-500 rounded-2xl p-5 shadow-lg shadow-[#07a0c3]/20 text-center relative z-10 border border-white/20 transform transition-transform hover:scale-105">
                            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-100 mb-1">Leads Capturados (WhatsApp)</p>
                            <p className="text-3xl font-black text-white tracking-tight">480</p>
                        </div>

                        {/* Seta e Conversão 2 */}
                        <div className="flex flex-col items-center my-2 relative z-0 w-full">
                            <div className="w-1 h-8 bg-gradient-to-b from-cyan-400 to-emerald-400 opacity-50"></div>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-md border border-slate-200 text-[#07a0c3] text-[10px] font-black px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
                                23.3% Fechamento
                            </div>
                        </div>

                        {/* Etapa 3 */}
                        <div className="w-8/12 bg-gradient-to-r from-emerald-500 to-green-500 rounded-2xl p-5 shadow-lg shadow-emerald-500/20 text-center relative z-10 border border-white/20 transform transition-transform hover:scale-105">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100 mb-1">Vendas Finalizadas</p>
                            <p className="text-3xl font-black text-white tracking-tight">112</p>
                        </div>
                    </div>
                </div>

                {/* Componente 2: Gráfico de Receita vs Economia */}
                <div className="xl:col-span-2 flex flex-col p-8 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2.5rem] animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <h2 className="text-[12px] font-black uppercase tracking-widest text-[#086788] flex items-center gap-3">
                            <TrendingUp size={18} className="text-[#07a0c3]" />
                            Receita Gerada vs Economia iFood (Últimos 7 dias)
                        </h2>
                    </div>

                    <div className="w-full h-[350px] mt-auto">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
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
                                <Tooltip
                                    cursor={{ fill: 'rgba(7, 160, 195, 0.05)' }}
                                    content={<CustomTooltip />}
                                />
                                <Legend
                                    iconType="circle"
                                    wrapperStyle={{
                                        paddingTop: '20px',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        color: '#64748b'
                                    }}
                                />

                                <Bar
                                    dataKey="faturamento"
                                    name="Faturamento via WhatsApp"
                                    fill="#086788"
                                    radius={[6, 6, 0, 0]}
                                    barSize={40}
                                    animationDuration={1500}
                                    animationEasing="ease-out"
                                />
                                <Bar
                                    dataKey="economia"
                                    name="Economia iFood (27%)"
                                    fill="#07a0c3"
                                    radius={[6, 6, 0, 0]}
                                    barSize={40}
                                    animationDuration={1500}
                                    animationEasing="ease-out"
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Ranking de Vendas por Produto Section */}
            <div className="mt-6 flex flex-col p-8 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2.5rem] relative z-10 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/50">
                    <div>
                        <h2 className="text-[14px] font-[900] uppercase tracking-widest text-[#086788] flex items-center gap-3">
                            <Award size={20} className="text-[#07a0c3]" />
                            Ranking de Vendas por Produto
                        </h2>
                        <p className="text-[10px] font-bold text-slate-500 mt-1 ml-8 uppercase tracking-widest">
                            Análise de Performance de Itens da Gamificação
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-6 w-full">
                    {topProdutos.map((produto, index) => {
                        if (produto.type === "divider") {
                            return (
                                <div key={`div-${index}`} className="flex items-center justify-center my-2 gap-4">
                                    <div className="h-px bg-slate-200 flex-1"></div>
                                    <span className="text-[10px] uppercase font-black text-slate-400 bg-white/50 px-3 py-1 rounded-full border border-slate-200">
                                        Menos Vendidos (Alerta)
                                    </span>
                                    <div className="h-px bg-slate-200 flex-1"></div>
                                </div>
                            );
                        }

                        const isGood = (produto.percentual || 0) >= 50;
                        const barColor = isGood ? 'bg-emerald-500' : 'bg-rose-400';
                        const barBg = isGood ? 'bg-emerald-50' : 'bg-rose-50';
                        const textColor = isGood ? 'text-emerald-700' : 'text-rose-600';

                        return (
                            <div key={`p-${index}`} className="flex flex-col sm:flex-row sm:items-center gap-4 group">
                                <div className="w-full sm:w-1/3 min-w-[200px]">
                                    <h3 className="text-sm font-black text-[#086788] truncate group-hover:text-[#07a0c3] transition-colors">
                                        {index + 1}. {produto.nome}
                                    </h3>
                                    <div className="flex gap-4 mt-1">
                                        <span className="text-[10px] font-bold uppercase text-slate-400">{produto.vendas} unidades</span>
                                        <span className="text-[10px] font-bold uppercase text-slate-400">R$ {produto.faturamento?.toFixed(2)}</span>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <div className={`w-full h-4 rounded-full ${barBg} overflow-hidden border border-white/30 shadow-inner`}>
                                        <div
                                            className={`h-full rounded-full ${barColor} shadow-sm transition-all duration-1000 ease-out`}
                                            style={{ width: `${produto.percentual}%` }}
                                        ></div>
                                    </div>
                                </div>
                                <div className="w-16 text-right shrink-0">
                                    <span className={`text-xs font-black ${textColor}`}>
                                        {produto.percentual}%
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Animações CSS */}
            <style>{`
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up {
                    animation: fadeInUp 0.6s ease-out forwards;
                    opacity: 0;
                }
            `}</style>
        </div>
    );
}
