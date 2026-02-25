"use client";

import React from "react";
import Link from "next/link";

type ButtonVariant = "purple" | "blue" | "dark";

type CustomButtonProps = {
  children: React.ReactNode;
  className?: string;
  variant?: ButtonVariant;
  onClick?: () => void;
  href?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  "aria-label"?: string;
};

// Componente de Botão Estilizado (Neon/Glass)
const CustomButton = ({
  children,
  onClick,
  className = "",
  variant = "purple",
  href,
  type = "button",
  disabled,
  ...rest
}: CustomButtonProps) => {
  const gradients: Record<ButtonVariant, string> = {
    purple:
      "from-indigo-600 via-purple-600 to-fuchsia-600 hover:shadow-[0_0_70px_-12px_#a855f7] shadow-[0_0_50px_-12px_#a855f7]",
    blue:
      "from-blue-600 via-cyan-600 to-blue-500 hover:shadow-[0_0_70px_-12px_#3b82f6] shadow-[0_0_50px_-12px_#3b82f6]",
    dark:
      "from-gray-800 via-gray-900 to-black hover:shadow-[0_0_70px_-12px_#000000] shadow-[0_0_40px_-12px_#000000]",
  };

  const baseClass = `group z-10 flex gap-2 overflow-hidden transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] text-lg font-semibold text-white h-14 ring-white/20 ring-1 rounded-full px-10 relative items-center justify-center ${
    gradients[variant]
  } ${className} ${disabled ? "opacity-60 pointer-events-none" : ""}`;

  const inner = (
    <>
      <div
        className={`absolute inset-0 bg-gradient-to-r ${gradients[variant].split(" ")[0]} ${
          gradients[variant].split(" ")[1]
        } ${gradients[variant].split(" ")[2]} opacity-80 transition-opacity duration-300 group-hover:opacity-100`}
      ></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.2),transparent_50%)] mix-blend-overlay"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.2),transparent_50%)] mix-blend-overlay"></div>
      <div className="transition-all duration-300 group-hover:border-white/70 group-hover:shadow-[inset_0_0_20px_rgba(255,255,255,0.7)] border-white/50 border rounded-full absolute top-0 right-0 bottom-0 left-0 shadow-[inset_0_0_15px_rgba(255,255,255,0.5)]"></div>
      <span className="relative z-10 flex items-center gap-2 drop-shadow-md leading-none whitespace-nowrap">
        {children}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={baseClass} {...rest}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={baseClass}
      {...rest}
    >
      {inner}
    </button>
  );
};

export default function App() {
  return (
    <div className="relative min-h-screen w-full bg-transparent font-sans overflow-x-hidden selection:bg-blue-100">
      {/* Estilos Globais para Animações */}
      <style>{`
        @keyframes cursor-float-1 {
          0%, 100% { transform: translate3d(-20px, 40px, 0); }
          33% { transform: translate3d(60px, -30px, 0); }
          66% { transform: translate3d(-40px, -10px, 0); }
        }
        @keyframes cursor-float-2 {
          0%, 100% { transform: translate3d(40px, -40px, 0); }
          50% { transform: translate3d(-30px, 50px, 0); }
        }
        @keyframes comment-pop {
          0% { opacity: 0; transform: scale(0.8) translateY(10px); }
          10%, 90% { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.8) translateY(10px); }
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
        .perspective-800 { perspective: 800px; }
        .rotate-x-12 { transform: rotateX(12deg); }
        .rotate-y-minus-12 { transform: rotateY(-12deg); }
        .animate-float { animation: float-slow 6s ease-in-out infinite; }
      `}</style>

      {/* Background Spline (Aura/Esfera) */}
      <div className="fixed top-0 left-0 w-full h-full -z-20 pointer-events-none">
        <iframe
          src="https://my.spline.design/crystalball-de222de54d6fc4752fa850b54fb654de/"
          frameBorder="0"
          width="100%"
          height="100%"
          id="aura-spline"
          className="w-full h-full object-cover scale-150 md:scale-110"
          style={{ background: "transparent" }}
          title="Aura Spline"
        ></iframe>
      </div>

      {/* Overlay de Brilho/Gradiente */}
      <div className="fixed top-0 left-0 w-full h-full -z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0)_0%,rgba(248,250,255,0.8)_100%)] pointer-events-none"></div>

      {/* Card Superior Estilo Vidro */}
      <div className="relative z-20 w-full flex justify-center pt-8 px-4 text-left">
        <div className="w-full max-w-4xl bg-white/40 backdrop-blur-md border border-white/40 rounded-3xl p-4 md:p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-200">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-[#0f172a] text-lg">
                  CRM Whats
                </h3>
                <span className="flex items-center gap-1.5 bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  <span className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse"></span>
                  Online agora
                </span>
              </div>
              <p className="text-gray-600 text-sm font-medium">
                Atendimento, vendas e operação no WhatsApp em um só lugar.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <CustomButton variant="dark" className="!h-11 !px-6 !text-sm" href="/login">
              Entrar
            </CustomButton>
            <CustomButton
              variant="purple"
              className="!h-11 !px-6 !text-sm"
              href="/signup"
            >
              Criar conta →
            </CustomButton>
          </div>
        </div>
      </div>

      {/* Navegação Superior */}
      <nav className="relative z-10 w-full flex justify-center py-6 px-6">
        <div className="flex space-x-6 md:space-x-12">
          {[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Inbox", href: "/inbox" },
            { label: "Kanban", href: "/kanban" },
            { label: "Automações", href: "" }, // deixa de lado (sem rota ainda)
            { label: "Relatórios", href: "" }, // deixa de lado (sem rota ainda)
          ].map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className="text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] text-gray-500 hover:text-blue-600 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.label}
                className="text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] text-gray-400/70"
              >
                {item.label}
              </span>
            )
          )}
        </div>
      </nav>

      {/* Conteúdo Principal (Hero Section) */}
      <main className="relative z-10 flex flex-col items-center justify-center text-center px-4 pt-4 md:pt-8 pb-20">
        <div className="flex items-center space-x-3 mb-6">
          <div className="h-1.5 w-1.5 bg-blue-600 rounded-full animate-pulse"></div>
          <span className="text-[10px] md:text-xs font-bold tracking-[0.4em] text-blue-600 uppercase">
            🚀 SUA MÁQUINA DE VENDAS AUTOMÁTICA
          </span>
          <div className="h-1.5 w-1.5 bg-blue-600 rounded-full animate-pulse"></div>
        </div>

        <h1 className="text-5xl md:text-8xl font-[900] text-[#0f172a] leading-[1.1] tracking-tighter mb-6 drop-shadow-sm text-balance uppercase">
          PARE DE DEPENDER <br />
          <span className="text-blue-600">DO IFOOD.</span>
        </h1>

        <p className="max-w-3xl text-gray-700 text-base md:text-xl leading-relaxed mb-12 px-4 font-medium">
          Transforme cada venda em um novo cliente direto no seu WhatsApp.
          <span className="block mt-2 text-[#0f172a] font-bold">
            Chega de pagar taxas absurdas e alugar clientes. Comece a construir sua base própria hoje.
          </span>
        </p>

        <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-16 w-full max-w-4xl">
          <CustomButton variant="blue" className="w-full md:w-auto" href="/signup">
            Começar agora
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1"
            >
              <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path>
              <path d="m21.854 2.147-10.94 10.939"></path>
            </svg>
          </CustomButton>

          <CustomButton variant="dark" className="w-full md:w-auto" href="/inbox">
            Ver Inbox
          </CustomButton>

          <CustomButton variant="dark" className="w-full md:w-auto" href="/dashboard">
            Ver Dashboard
          </CustomButton>
        </div>

        {/* --- SEÇÃO 1: MÁQUINA DE VENDAS (INTERATIVO) --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 gap-x-16 gap-y-16 pl-10 pt-10 pr-10 max-w-7xl items-center my-24 mx-auto text-left relative z-10">
          {/* Card Visual Interativo: Vendedor Automático */}
          <div className="order-2 lg:order-1 aspect-square lg:aspect-video overflow-hidden group bg-white/20 backdrop-blur-xl border-white/40 border-2 rounded-[2rem] relative shadow-2xl">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(37,99,235,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_90%)]"></div>
            <div className="flex overflow-hidden absolute inset-0 perspective-800 items-center justify-center">
              {/* Interface do Chatbot */}
              <div className="relative w-72 bg-white/90 backdrop-blur-md border border-blue-100 rounded-3xl shadow-2xl transform rotate-x-12 rotate-y-minus-12 flex flex-col p-4 z-10 animate-float">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                    🤖
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">
                      Vendedor Automático
                    </div>
                    <div className="text-[10px] text-green-500 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>{" "}
                      Digitando...
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="bg-gray-100 p-2 rounded-2xl rounded-tl-none text-[11px] text-gray-600 w-4/5">
                    Olá! Aqui está nosso cardápio interativo 🍕
                  </div>
                  <div className="bg-blue-600 p-2 rounded-2xl rounded-tr-none text-[11px] text-white w-4/5 ml-auto">
                    Quero uma Pizza Grande!
                  </div>
                  <div className="bg-gray-100 p-2 rounded-2xl rounded-tl-none text-[11px] text-gray-600 w-4/5">
                    Ótima escolha! Deseja adicionar borda recheada por apenas R$ 5? 🎁
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between">
                  <div className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg uppercase">
                    Pedido Aberto
                  </div>
                  <div className="text-[10px] font-bold text-gray-900">
                    Total: R$ 54,90
                  </div>
                </div>
              </div>

              {/* Sarah Cursor (Sarah está vendo o pedido) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <div className="animate-[cursor-float-1_12s_infinite_ease-in-out]">
                  <svg
                    className="w-5 h-5 text-blue-600 drop-shadow-lg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style={{ transform: "rotate(-25deg)" }}
                  >
                    <path d="M5.5 3.21l10.8 5.4a1 1 0 0 1 .16 1.7l-4.2 2.1 2.1 4.2a1 1 0 0 1-1.8.9l-2.1-4.2-4.2 2.1a1 1 0 0 1-1.45-1.09l1.69-11.11z" />
                  </svg>
                  <div className="ml-3.5 -mt-1 px-2.5 py-1 rounded-full bg-blue-600 text-[10px] font-bold text-white shadow-xl whitespace-nowrap">
                    Sarah (Gerente)
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Copy Seção 1 */}
          <div className="order-1 lg:order-2">
            <div className="bg-blue-100 text-blue-600 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full w-fit mb-4">
              🎯 Capture & Converta
            </div>
            <h3 className="text-4xl md:text-5xl font-[900] text-[#0f172a] tracking-tight mb-6 uppercase">
              SEU VENDEDOR <span className="text-blue-600">QUE NUNCA DORME.</span>
            </h3>
            <p className="leading-relaxed text-lg md:text-xl text-gray-500 mb-8">
              Transforme pedidos do 99 e iFood em uma base própria. Nosso agente inteligente envia cardápios, sugere adicionais e fecha pedidos 24h por dia.{" "}
              <strong>Você para de alugar clientes e passa a possuir ativos.</strong>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: "Cupom Inteligente", desc: "Faz o cliente voltar sozinho no momento certo." },
                { title: "Independência Total", desc: "Reduza taxas absurdas de plataformas terceiras." },
              ].map((item, i) => (
                <div key={i} className="bg-white/50 border border-white p-4 rounded-2xl">
                  <div className="font-bold text-[#0f172a] mb-1">{item.title}</div>
                  <div className="text-sm text-gray-500">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* --- SEÇÃO 2: DASHBOARD & ROI (DASHBOARD VISUAL) --- */}
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

        {/* --- SEÇÃO 3: PREÇOS (GLASS CARDS) --- */}
        <section className="relative z-10 py-24 px-4 w-full max-w-7xl mx-auto overflow-visible">
          <div className="text-center mb-16">
            <div className="inline-block bg-blue-100 text-blue-600 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
              💎 Invista no seu crescimento
            </div>
            <h2 className="text-4xl md:text-6xl font-[900] text-[#0f172a] tracking-tight uppercase">
              ESCOLHA SEU <span className="text-blue-600">PLANO DE LUCRO.</span>
            </h2>
            <p className="text-gray-500 text-lg mt-4 font-medium">
              Teste grátis por 7 dias. Sem compromisso. Cancele quando quiser.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
            {[
              {
                name: "Starter",
                priceInt: "97",
                priceDec: "90",
                desc: "Ideal para quem está começando a automatizar.",
                features: ["Vendedor Automático", "Até 500 Clientes/mês", "Recuperação de Vendas", "Dashboard Básico"],
              },
              {
                name: "Professional",
                priceInt: "197",
                priceDec: "90",
                desc: "A máquina completa para escalar seu delivery.",
                features: ["Tudo do Starter", "Clientes Ilimitados", "Kanban de Produção", "Relatórios Avançados", "Suporte Prioritário"],
                popular: true,
              },
              {
                name: "Elite",
                priceInt: "247",
                priceDec: "00",
                desc: "Poder total para grandes operações de venda.",
                features: ["Tudo do Professional", "Multiatendimento", "Múltiplos Cardápios", "API de Integração", "Gerente de Conta"],
              },
            ].map((plan, i) => (
              <div
                key={i}
                className={`relative group flex flex-col bg-white/30 backdrop-blur-xl border-2 transition-all duration-500 rounded-[2.5rem] p-8 md:p-10 shadow-xl hover:shadow-2xl hover:-translate-y-4 ${
                  plan.popular ? "border-blue-500 h-[105%] bg-white/50" : "border-white/50"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                    Mais Escolhido
                  </div>
                )}

                <div className="mb-8">
                  <h4 className="text-xl font-black text-[#0f172a] uppercase mb-2">{plan.name}</h4>
                  <p className="text-sm text-gray-500 font-medium leading-tight">{plan.desc}</p>
                </div>

                {/* Ajustado para não cortar o valor */}
                <div className="mb-8 flex items-baseline flex-wrap">
                  <span className="text-2xl font-bold text-gray-400 mr-1">R$</span>
                  <div className="relative group-hover:text-blue-600 transition-colors duration-300 flex items-baseline">
                    <span className="text-6xl font-black text-[#0f172a] tracking-tighter">{plan.priceInt}</span>
                    <span className="text-2xl font-black text-[#0f172a] ml-0.5">,{plan.priceDec}</span>
                  </div>
                  <span className="text-gray-400 font-bold ml-1">/mês</span>
                </div>

                <div className="space-y-4 mb-10 flex-grow">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-sm font-semibold text-gray-600">
                      <div className="bg-blue-100 text-blue-600 rounded-full p-0.5">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      {feature}
                    </div>
                  ))}
                </div>

                {/* botão de preço: por enquanto manda pro signup */}
                <CustomButton variant={plan.popular ? "blue" : "dark"} className="w-full !h-14 !text-base" href="/signup">
                  Teste 7 dias grátis
                </CustomButton>

                {/* Elemento Decorativo: Vidro que brilha no hover */}
                <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
              </div>
            ))}
          </div>
        </section>

        {/* --- FINAL CTA SECTION --- */}
        <section className="relative z-10 py-24 px-4 w-full max-w-5xl mx-auto">
          <div className="bg-[#0f172a] rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden shadow-2xl">
            {/* Glossy Overlay */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.3),transparent_70%)] pointer-events-none"></div>

            <h2 className="text-4xl md:text-6xl font-[900] text-white mb-8 relative z-10 leading-tight">
              ISSO NÃO É SÓ UM CRM.<br />
              <span className="text-blue-400 underline decoration-blue-600 underline-offset-8">É SUA INDEPENDÊNCIA.</span>
            </h2>
            <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-12 relative z-10">
              Capte. Converta. Recupere. Controle. E veja o lucro real cair na conta sem depender de anúncios ou taxas de terceiros.
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 relative z-10">
              <CustomButton
                variant="blue"
                className="w-full md:w-auto !h-16 !px-12 !text-xl shadow-[0_0_50px_-10px_#2563eb]"
                href="/signup"
              >
                Quero Minha Máquina de Vendas
              </CustomButton>
            </div>
          </div>
        </section>
      </main>

      {/* --- RODAPÉ (FOOTER) --- */}
      <footer className="relative z-10 w-full border-t border-white/40 bg-white/20 backdrop-blur-md pt-20 pb-10 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-20">
          {/* Logo e Descrição */}
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="font-black text-[#0f172a] text-2xl uppercase tracking-tighter">CRM Whats</h3>
            </div>
            <p className="text-gray-500 font-medium leading-relaxed">
              A ferramenta líder para transformar conversas em lucro real. Automatize seu delivery e recupere sua margem.
            </p>
          </div>

          {/* Produto */}
          <div>
            <h4 className="font-black text-[#0f172a] uppercase tracking-widest text-xs mb-8">Produto</h4>
            <ul className="space-y-4">
              {["Funcionalidades", "Integrações", "Preços", "Atualizações"].map((item) => (
                <li key={item}>
                  <a href="#" className="text-gray-500 hover:text-blue-600 transition-colors font-semibold text-sm">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Suporte */}
          <div>
            <h4 className="font-black text-[#0f172a] uppercase tracking-widest text-xs mb-8">Suporte</h4>
            <ul className="space-y-4">
              {["Central de Ajuda", "Documentação API", "Comunidade", "Status"].map((item) => (
                <li key={item}>
                  <a href="#" className="text-gray-500 hover:text-blue-600 transition-colors font-semibold text-sm">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter */}
          <div className="space-y-6">
            <h4 className="font-black text-[#0f172a] uppercase tracking-widest text-xs mb-4">Newsletter</h4>
            <p className="text-gray-500 text-sm font-semibold">Dicas de automação no seu e-mail.</p>
            <div className="relative group">
              <input
                type="email"
                placeholder="Seu melhor e-mail"
                className="w-full bg-white/50 border border-white/50 rounded-2xl py-4 px-6 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-all shadow-sm"
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#0f172a] text-white p-2 rounded-xl hover:bg-blue-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="max-w-7xl mx-auto border-t border-gray-200/50 pt-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
            © 2024 CRM Whats. Todos os direitos reservados.
          </p>
          <div className="flex gap-8">
            <a href="#" className="text-gray-400 hover:text-blue-600 text-xs font-bold uppercase tracking-widest transition-colors">
              Privacidade
            </a>
            <a href="#" className="text-gray-400 hover:text-blue-600 text-xs font-bold uppercase tracking-widest transition-colors">
              Termos
            </a>
          </div>
        </div>
      </footer>

      {/* Gradiente Inferior Suave */}
      <div className="fixed bottom-0 left-0 w-full h-40 bg-gradient-to-t from-[#f8faff] via-[#f8faff]/40 to-transparent pointer-events-none -z-10"></div>
    </div>
  );
}