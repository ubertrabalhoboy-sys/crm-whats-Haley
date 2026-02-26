"use client";

import useSWR from "swr";
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};
import {
  Wallet,
  PiggyBank,
  Users,
  Activity,
  LayoutDashboard,
  Tag,
  Image as ImageIcon
} from "lucide-react";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Erro de Fetch");
  return json;
};

type ProdutoPromo = {
  id: string;
  nome: string;
  preco_original: number;
  preco_promo: number;
  estoque: number;
  imagem_url?: string;
};

type DashboardData = {
  ok: boolean;
  metrics: {
    faturamentoZap: number;
    economiaIfood: number;
    roletaLeads: number;
    taxaConversao: number;
    chatsComVenda: number;
    totalLeads: number;
  };
  topProdutos: ProdutoPromo[];
};

export default function DashboardPage() {
  const { data, error, isLoading } = useSWR<DashboardData>(
    `/api/dashboard`,
    fetcher,
    { refreshInterval: 10000 }
  );

  const metrics = data?.metrics || {
    faturamentoZap: 0,
    economiaIfood: 0,
    roletaLeads: 0,
    taxaConversao: 0,
    chatsComVenda: 0,
    totalLeads: 0
  };

  const produtos = data?.topProdutos || [];

  return (
    <div className="w-full h-full overflow-y-auto custom-scroll px-4 pb-12">
      {/* Pattern de fundo */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.03] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />

      {/* Header */}
      <div className="mb-8 mt-2 flex items-center justify-between rounded-[2.5rem] border border-white/60 bg-white/40 px-8 py-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl relative z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#086788] to-[#07a0c3] text-white shadow-lg shadow-[#086788]/20">
            <LayoutDashboard size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-[950] uppercase tracking-tighter text-[#086788] leading-none">
              Resumo da Operação
            </h1>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-[#07a0c3]">
              Visão Geral do Seu Delivery
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8 relative z-10">
        {/* KPI 1 */}
        <div className="group relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 p-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#086788]/10 hover:bg-white/60">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#07a0c3]">Faturamento Zap</p>
              <h3 className="mt-2 text-3xl font-black tracking-tight text-[#086788]">
                {isLoading ? "..." : formatCurrency(metrics.faturamentoZap)}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#086788]/10 to-[#07a0c3]/10 text-[#086788] transition-transform group-hover:scale-110 group-hover:bg-[#086788] group-hover:text-white">
              <Wallet size={24} />
            </div>
          </div>
          <p className="mt-4 text-xs font-bold text-emerald-500 flex items-center gap-1">
            +12% <span className="text-slate-400 font-medium">que a última semana</span>
          </p>
        </div>

        {/* KPI 2 */}
        <div className="group relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 p-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#086788]/10 hover:bg-white/60">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#07a0c3]">Economia iFood (27%)</p>
              <h3 className="mt-2 text-3xl font-black tracking-tight text-[#086788]">
                {isLoading ? "..." : formatCurrency(metrics.economiaIfood)}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#07a0c3]/10 to-cyan-500/10 text-[#07a0c3] transition-transform group-hover:scale-110 group-hover:bg-[#07a0c3] group-hover:text-white">
              <PiggyBank size={24} />
            </div>
          </div>
          <p className="mt-4 text-xs font-bold text-amber-500 flex items-center gap-1">
            Valor que ficou no seu bolso
          </p>
        </div>

        {/* KPI 3 */}
        <div className="group relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 p-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#086788]/10 hover:bg-white/60">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#07a0c3]">Leads da Roleta</p>
              <h3 className="mt-2 text-3xl font-black tracking-tight text-[#086788]">
                {isLoading ? "..." : metrics.roletaLeads}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-500 transition-transform group-hover:scale-110 group-hover:bg-indigo-500 group-hover:text-white">
              <Users size={24} />
            </div>
          </div>
          <p className="mt-4 text-xs font-bold text-indigo-500 flex items-center gap-1">
            Novos contatos capturados
          </p>
        </div>

        {/* KPI 4 */}
        <div className="group relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 p-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#086788]/10 hover:bg-white/60">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#07a0c3]">Taxa de Conversão</p>
              <h3 className="mt-2 text-3xl font-black tracking-tight text-[#086788]">
                {isLoading ? "..." : `${metrics.taxaConversao.toFixed(1)}%`}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/10 to-green-500/10 text-emerald-500 transition-transform group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white">
              <Activity size={24} />
            </div>
          </div>
          <p className="mt-4 text-xs font-bold text-slate-400 flex items-center gap-1">
            {metrics.chatsComVenda} vendas / {metrics.totalLeads} leads totais
          </p>
        </div>
      </div>

      {/* Top Produtos Section */}
      <div className="w-full bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2.5rem] p-8 relative z-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#086788]/10 to-[#07a0c3]/10 text-[#086788]">
            <Tag size={20} />
          </div>
          <h2 className="text-xl font-black text-[#086788] tracking-tight">Top Produtos da Gamificação</h2>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 p-6 border border-red-100 text-center mb-6">
            <span className="text-red-500 font-bold block">Erro ao carregar dados do Dashboard.</span>
          </div>
        )}

        {produtos.length === 0 && !isLoading && !error ? (
          <div className="w-full h-[300px] flex flex-col items-center justify-center border-2 border-dashed border-[#086788]/20 rounded-3xl text-center">
            <div className="h-20 w-20 bg-white/60 rounded-full flex items-center justify-center mb-6 shadow-md shadow-[#086788]/5">
              <Tag size={32} className="text-[#07a0c3]/50" />
            </div>
            <h3 className="text-base font-bold text-slate-700 mb-1">Nenhum produto cadastrado</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              Quando você cadastrar produtos na área de Promoções, eles aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto custom-scroll pb-2">
            <table className="w-full text-left border-collapse whitespace-nowrap">
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
                      <div className="flex items-center gap-3">
                        {p.imagem_url ? (
                          <img src={p.imagem_url} alt={p.nome} className="h-10 w-10 shrink-0 object-cover rounded-lg shadow-sm border border-white/50" />
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br from-[#07a0c3]/20 to-[#086788]/20 flex items-center justify-center text-[#086788] shadow-inner border border-white/50">
                            <ImageIcon size={18} />
                          </div>
                        )}
                        <div className="font-bold text-sm text-[#086788] group-hover:text-[#07a0c3] transition-colors">{p.nome}</div>
                      </div>
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
