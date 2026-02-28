import React from "react";

export default function Footer() {
    return (
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
    );
}
