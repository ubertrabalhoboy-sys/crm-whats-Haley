"use client";

import useSWR from "swr";
import Link from "next/link";
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
  Image as ImageIcon,
  Zap,
  Smartphone,
  Settings,
  ArrowRight,
  CheckCircle2,
  Circle,
  Dices,
  MessageSquare
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
    leadsHoje: number;
    leadsSemana: number;
    taxaConversao: number;
    girosRoleta: number;
    mensagensEnviadas: number;
    chatsComVenda: number;
    totalLeads: number;
  };
  topProdutos: ProdutoPromo[];
  webhookStats?: {
    total7d: number;
    hoje: number;
    successCount: number;
    errorCount: number;
    porDia: { dia: string; success: number; error: number }[];
  };
  onboarding?: {
    whatsappConnected: boolean;
    storeConfigured: boolean;
    automationConfigured: boolean;
    firstLeadMoved: boolean;
  };
};

export default function DashboardPage() {
  const { data, error, isLoading } = useSWR<DashboardData>(
    `/api/dashboard`,
    fetcher,
    { refreshInterval: 10000 }
  );

  const metrics = data?.metrics || {
    leadsHoje: 0,
    leadsSemana: 0,
    taxaConversao: 0,
    girosRoleta: 0,
    mensagensEnviadas: 0,
    chatsComVenda: 0,
    totalLeads: 0
  };

  const produtos = data?.topProdutos || [];
  const webhookStats = data?.webhookStats || { total7d: 0, hoje: 0, successCount: 0, errorCount: 0, porDia: [] };
  const maxDayCount = Math.max(1, ...webhookStats.porDia.map(d => d.success + d.error));
  const onboarding = data?.onboarding || { whatsappConnected: false, storeConfigured: false, automationConfigured: false, firstLeadMoved: false };
  const allComplete = onboarding.whatsappConnected && onboarding.storeConfigured && onboarding.automationConfigured && onboarding.firstLeadMoved;

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

      {/* Onboarding Checklist */}
      {!isLoading && !allComplete && (
        <div className="mb-8 rounded-[2.5rem] border border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 to-teal-50/80 backdrop-blur-xl p-8 shadow-lg shadow-emerald-500/5 relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-emerald-900 tracking-tight">🚀 Setup Inicial</h2>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Complete os passos abaixo para ativar o sistema</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Step 1 */}
            <Link href="/settings/whatsapp" className={`group flex items-center gap-4 p-5 rounded-2xl border transition-all duration-300 ${onboarding.whatsappConnected ? 'border-emerald-300 bg-emerald-100/50' : 'border-white/60 bg-white/60 hover:border-emerald-300 hover:shadow-md'}`}>
              {onboarding.whatsappConnected
                ? <CheckCircle2 size={24} className="text-emerald-500 shrink-0" />
                : <Circle size={24} className="text-slate-300 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-black ${onboarding.whatsappConnected ? 'text-emerald-700' : 'text-slate-700'}`}>Conectar WhatsApp</p>
                <p className="text-[10px] text-slate-400 font-semibold">Vincule o aparelho da loja</p>
              </div>
              <ArrowRight size={16} className="text-slate-300 shrink-0 group-hover:text-emerald-500 transition-colors" />
            </Link>
            {/* Step 2 */}
            <Link href="/settings/store" className={`group flex items-center gap-4 p-5 rounded-2xl border transition-all duration-300 ${onboarding.storeConfigured ? 'border-emerald-300 bg-emerald-100/50' : 'border-white/60 bg-white/60 hover:border-emerald-300 hover:shadow-md'}`}>
              {onboarding.storeConfigured
                ? <CheckCircle2 size={24} className="text-emerald-500 shrink-0" />
                : <Circle size={24} className="text-slate-300 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-black ${onboarding.storeConfigured ? 'text-emerald-700' : 'text-slate-700'}`}>Configurar Loja</p>
                <p className="text-[10px] text-slate-400 font-semibold">Preencha Endereço e PIX</p>
              </div>
              <ArrowRight size={16} className="text-slate-300 shrink-0 group-hover:text-emerald-500 transition-colors" />
            </Link>
            {/* Step 3 */}
            <Link href="/kanban" className={`group flex items-center gap-4 p-5 rounded-2xl border transition-all duration-300 ${onboarding.automationConfigured ? 'border-emerald-300 bg-emerald-100/50' : 'border-white/60 bg-white/60 hover:border-emerald-300 hover:shadow-md'}`}>
              {onboarding.automationConfigured
                ? <CheckCircle2 size={24} className="text-emerald-500 shrink-0" />
                : <Circle size={24} className="text-slate-300 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-black ${onboarding.automationConfigured ? 'text-emerald-700' : 'text-slate-700'}`}>Tags do Fiqon</p>
                <p className="text-[10px] text-slate-400 font-semibold">Configure na aba Automação</p>
              </div>
              <ArrowRight size={16} className="text-slate-300 shrink-0 group-hover:text-emerald-500 transition-colors" />
            </Link>
            {/* Step 3 */}
            <Link href="/kanban" className={`group flex items-center gap-4 p-5 rounded-2xl border transition-all duration-300 ${onboarding.firstLeadMoved ? 'border-emerald-300 bg-emerald-100/50' : 'border-white/60 bg-white/60 hover:border-emerald-300 hover:shadow-md'}`}>
              {onboarding.firstLeadMoved
                ? <CheckCircle2 size={24} className="text-emerald-500 shrink-0" />
                : <Circle size={24} className="text-slate-300 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-black ${onboarding.firstLeadMoved ? 'text-emerald-700' : 'text-slate-700'}`}>Mover 1º Lead</p>
                <p className="text-[10px] text-slate-400 font-semibold">Arraste um card no Kanban</p>
              </div>
              <ArrowRight size={16} className="text-slate-300 shrink-0 group-hover:text-emerald-500 transition-colors" />
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-8 relative z-10">
        {/* KPI 1 - Leads Hoje */}
        <div className="group relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 p-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#086788]/10 hover:bg-white/60">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#07a0c3]">Leads Hoje</p>
              <h3 className="mt-2 text-3xl font-black tracking-tight text-[#086788]">
                {isLoading ? "..." : metrics.leadsHoje}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#086788]/10 to-[#07a0c3]/10 text-[#086788] transition-transform group-hover:scale-110 group-hover:bg-[#086788] group-hover:text-white">
              <Users size={24} />
            </div>
          </div>
          <p className="mt-4 text-xs font-bold text-emerald-500 flex items-center gap-1">
            Novos contatos do dia
          </p>
        </div>

        {/* KPI 2 - Leads Semana */}
        <div className="group relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 p-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#086788]/10 hover:bg-white/60">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#07a0c3]">Leads Semana</p>
              <h3 className="mt-2 text-3xl font-black tracking-tight text-[#086788]">
                {isLoading ? "..." : metrics.leadsSemana}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-blue-500/10 text-indigo-500 transition-transform group-hover:scale-110 group-hover:bg-indigo-500 group-hover:text-white">
              <Activity size={24} />
            </div>
          </div>
          <p className="mt-4 text-xs font-bold text-indigo-500 flex items-center gap-1">
            Últimos 7 dias
          </p>
        </div>

        {/* KPI 3 - Taxa de Conversão */}
        <div className="group relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 p-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#086788]/10 hover:bg-white/60">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#07a0c3]">Conversão Kanban</p>
              <h3 className="mt-2 text-3xl font-black tracking-tight text-[#086788]">
                {isLoading ? "..." : `${metrics.taxaConversao.toFixed(1)}%`}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/10 to-green-500/10 text-emerald-500 transition-transform group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white">
              <CheckCircle2 size={24} />
            </div>
          </div>
          <p className="mt-4 text-xs font-bold text-slate-400 flex items-center gap-1">
            {metrics.chatsComVenda} / {metrics.totalLeads} leads ganhos
          </p>
        </div>

        {/* KPI 4 - Giros da Roleta */}
        <div className="group relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 p-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#086788]/10 hover:bg-white/60">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#07a0c3]">Giros da Roleta</p>
              <h3 className="mt-2 text-3xl font-black tracking-tight text-[#086788]">
                {isLoading ? "..." : metrics.girosRoleta}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 text-purple-500 transition-transform group-hover:scale-110 group-hover:bg-purple-500 group-hover:text-white">
              <Dices size={24} />
            </div>
          </div>
          <p className="mt-4 text-xs font-bold text-purple-500 flex items-center gap-1">
            Jogadas dos clientes
          </p>
        </div>

        {/* KPI 5 - Mensagens Enviadas */}
        <div className="group relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 p-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#086788]/10 hover:bg-white/60">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#07a0c3]">Msg Recebida</p>
              <h3 className="mt-2 text-3xl font-black tracking-tight text-[#086788]">
                {isLoading ? "..." : metrics.mensagensEnviadas}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 text-amber-500 transition-transform group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-white">
              <MessageSquare size={24} />
            </div>
          </div>
          <p className="mt-4 text-xs font-bold text-amber-500 flex items-center gap-1">
            {webhookStats.hoje} apenas hoje
          </p>
        </div>
      </div>

      {/* Webhook Per-Day Chart */}
      {webhookStats.porDia.length > 0 && (
        <div className="w-full bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2.5rem] p-8 mb-8 relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 text-amber-500">
              <Zap size={20} />
            </div>
            <h2 className="text-xl font-black text-[#086788] tracking-tight">CVS iniciada Roleta</h2>
          </div>
          <div className="flex items-end gap-3 h-32">
            {webhookStats.porDia.map((d) => {
              const total = d.success + d.error;
              const heightPct = (total / maxDayCount) * 100;
              const diaLabel = new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
              return (
                <div key={d.dia} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-[11px] font-black text-[#086788]">{total}</span>
                  <div className="w-full flex flex-col justify-end rounded-xl overflow-hidden" style={{ height: '80px' }}>
                    <div
                      className="w-full bg-gradient-to-t from-[#086788] to-[#07a0c3] rounded-xl transition-all duration-500"
                      style={{ height: `${Math.max(heightPct, 5)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">{diaLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
