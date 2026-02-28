import React from "react";

export default function SectionMachine() {
    return (
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
    );
}
