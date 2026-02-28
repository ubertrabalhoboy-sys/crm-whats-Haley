import React from "react";
import { CustomButton } from "./CustomButton";

export default function SectionCTA() {
    return (
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
    );
}
