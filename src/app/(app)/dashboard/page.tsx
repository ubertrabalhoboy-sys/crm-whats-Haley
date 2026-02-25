"use client";

import useSWR from "swr";
import {
  TrendingUp,
  PiggyBank,
  Users,
  Activity,
  LayoutDashboard,
  Tag
} from "lucide-react";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Erro de Fetch");
  return json;
};

type Metrics = {
  faturamentoZap: number;
  economiaIfood: number;
  roletaLeads: number;
  taxaConversao: number;
};

type ProdutoPromo = {
  id: string;
  nome: string;
  preco_original: number;
  preco_promo: number;
  estoque: number;
};

type DashboardData = {
  ok: boolean;
  metrics: Metrics;
  topProdutos: ProdutoPromo[];
};

export default function DashboardPage() {
  const { data, error, isValidating } = useSWR<DashboardData>("/api/dashboard", fetcher, {
    refreshInterval: 10000
  });

  const m = data?.metrics || {
    faturamentoZap: 0,
    economiaIfood: 0,
    roletaLeads: 0,
    taxaConversao: 0
  };

  const produtos = data?.topProdutos || [];
  const isLoading = !data && !error;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  return (
    <div className="relative h-full flex flex-col overflow-y-auto custom-scroll w-full px-2 pb-6">
      {/* Pattern de fundo */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.03] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />

      {/* Header */}
      <div className="mb-8 mt-2 flex items-center justify-between rounded-[2.5rem] border border-white/60 bg-white/40 px-8 py-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl relative z-10 shrink-0 mx-2">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#086788] to-[#07a0c3] text-white shadow-lg shadow-[#086788]/20">
            <LayoutDashboard size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-[950] uppercase tracking-tighter text-[#086788] leading-none">
              Dashboard ROI
            </h1>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-[#07a0c3]">
              Resultados de Vendas e Gamificação
            </p>
          </div>
        </div>

        {/* Loading Indicator */}
        {(isLoading || isValidating) && (
          <div className="flex gap-2 mr-4">
            <div className="h-2 w-2 rounded-full bg-[#07a0c3] animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="h-2 w-2 rounded-full bg-[#07a0c3] animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="h-2 w-2 rounded-full bg-[#07a0c3] animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        )}
      </div>

      {error && (
        <div className="mx-2 mb-6 rounded-2xl bg-red-50 p-6 border border-red-100 text-center relative z-10">
          <span className="text-red-500 font-bold block">{error.message || "Erro ao carregar Dashboard"}</span>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 px-2 mb-8 relative z-10">

        {/* Faturamento Zap */}
        <div className="flex flex-col p-6 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2rem] hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-100/50 text-[#086788] rounded-2xl border border-blue-200/50">
              <TrendingUp size={20} />
            </div>
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[#086788]">Faturamento Zap</h2>
          </div>
          <div className="text-3xl font-black text-slate-800 tracking-tight">
            {formatCurrency(m.faturamentoZap)}
          </div>
          <div className="mt-2 text-xs font-bold text-slate-400">Total vendido via chat direct</div>
        </div>

        {/* Economia iFood (Destaque) */}
        <div className="flex flex-col p-6 bg-gradient-to-br from-[#07a0c3]/10 to-[#086788]/5 backdrop-blur-xl border border-[#07a0c3]/30 shadow-lg shadow-[#07a0c3]/20 rounded-[2rem] hover:-translate-y-1 hover:shadow-xl hover:shadow-[#07a0c3]/30 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#07a0c3]/10 rounded-full blur-2xl -mr-10 -mt-10" />
          <div className="flex items-center gap-3 mb-4 relative z-10">
            <div className="p-3 bg-[#07a0c3] text-white rounded-2xl shadow-md shadow-[#07a0c3]/40">
              <PiggyBank size={20} />
            </div>
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[#086788]">Economia iFood</h2>
          </div>
          <div className="text-4xl font-black text-[#086788] tracking-tight relative z-10">
            {formatCurrency(m.economiaIfood)}
          </div>
          <div className="mt-2 text-xs font-bold text-[#07a0c3] relative z-10">27% que ficaram no seu bolso</div>
        </div>

        {/* Leads da Roleta */}
        <div className="flex flex-col p-6 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2rem] hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-purple-100/50 text-purple-600 rounded-2xl border border-purple-200/50">
              <Users size={20} />
            </div>
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[#086788]">Leads da Roleta</h2>
          </div>
          <div className="text-3xl font-black text-slate-800 tracking-tight">
            {m.roletaLeads} <span className="text-lg font-bold text-slate-400">leads</span>
          </div>
          <div className="mt-2 text-xs font-bold text-slate-400">Novos contatos capturados</div>
        </div>

        {/* Taxa de Conversão */}
        <div className="flex flex-col p-6 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2rem] hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-emerald-100/50 text-emerald-600 rounded-2xl border border-emerald-200/50">
              <Activity size={20} />
            </div>
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[#086788]">Conversão (Vendas)</h2>
          </div>
          <div className="text-3xl font-black text-slate-800 tracking-tight">
            {m.taxaConversao.toFixed(1)}%
          </div>
          <div className="mt-2 text-xs font-bold text-slate-400">Leads convertidos em vendas</div>
        </div>

      </div>

      {/* Top Produtos Section */}
      <div className="flex-1 min-h-0 mx-2 flex flex-col p-8 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2.5rem] relative z-10">
        <h2 className="text-lg font-black uppercase tracking-widest text-[#086788] mb-6 flex items-center gap-3">
          <Tag size={20} className="text-[#07a0c3]" />
          Top Produtos da Gamificação (Ofertas)
        </h2>

        {produtos.length === 0 && !isLoading && !error ? (
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-[#086788]/10 rounded-3xl p-10 text-center">
            <div className="h-16 w-16 bg-white/60 rounded-full flex items-center justify-center mb-4 shadow-xl shadow-[#086788]/5">
              <Tag size={24} className="text-[#086788]/40" />
            </div>
            <h3 className="text-base font-bold text-slate-700 mb-1">Nenhum produto cadastrado</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              Quando você cadastrar produtos na área de Promoções, eles aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scroll pb-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="pb-4 pt-2 px-4 border-b border-white/60 text-[10px] font-black uppercase tracking-widest text-slate-400">Produto</th>
                  <th className="pb-4 pt-2 px-4 border-b border-white/60 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Preço Original</th>
                  <th className="pb-4 pt-2 px-4 border-b border-white/60 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Preço Promo</th>
                  <th className="pb-4 pt-2 px-4 border-b border-white/60 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id} className="group hover:bg-white/50 transition-colors border-b border-white/30 last:border-0">
                    <td className="py-4 px-4">
                      <div className="font-bold text-sm text-[#086788] group-hover:text-[#07a0c3] transition-colors">{p.nome}</div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="text-sm font-semibold text-slate-400 line-through">{formatCurrency(p.preco_original)}</span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="text-sm font-black text-emerald-600">{formatCurrency(p.preco_promo)}</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`inline-block px-2 py-1 rounded-md text-[10px] font-black ${p.estoque > 0 ? 'bg-indigo-50 text-indigo-500' : 'bg-red-50 text-red-500'}`}>
                        {p.estoque > 0 ? `${p.estoque} Disponíveis` : 'Esgotado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
