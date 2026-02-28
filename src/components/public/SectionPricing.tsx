import React from "react";
import { CustomButton } from "./CustomButton";

export default function SectionPricing() {
    return (
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
                        className={`relative group flex flex-col bg-white/30 backdrop-blur-xl border-2 transition-all duration-500 rounded-[2.5rem] p-8 md:p-10 shadow-xl hover:shadow-2xl hover:-translate-y-4 ${plan.popular ? "border-blue-500 h-[105%] bg-white/50" : "border-white/50"
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
    );
}
