"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { CustomButton } from "@/components/public/CustomButton";

const SectionMachine = dynamic(() => import('@/components/public/SectionMachine'), { ssr: true });
const SectionDashboard = dynamic(() => import('@/components/public/SectionDashboard'), { ssr: true });
const SectionPricing = dynamic(() => import('@/components/public/SectionPricing'), { ssr: true });
const SectionCTA = dynamic(() => import('@/components/public/SectionCTA'), { ssr: true });
const Footer = dynamic(() => import('@/components/public/Footer'), { ssr: true });

export default function App() {
  const [showSpline, setShowSpline] = useState(false);

  useEffect(() => {
    // Delay marginally to ensure text/main UI paints first
    const timer = setTimeout(() => {
      setShowSpline(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

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
        {showSpline && (
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
        )}
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
        <SectionMachine />

        {/* --- SEÇÃO 2: DASHBOARD & ROI (DASHBOARD VISUAL) --- */}
        <SectionDashboard />

        {/* --- SEÇÃO 3: PREÇOS (GLASS CARDS) --- */}
        <SectionPricing />

        {/* --- FINAL CTA SECTION --- */}
        <SectionCTA />
      </main>

      {/* --- RODAPÉ (FOOTER) --- */}
      <Footer />

      {/* Gradiente Inferior Suave */}
      <div className="fixed bottom-0 left-0 w-full h-40 bg-gradient-to-t from-[#f8faff] via-[#f8faff]/40 to-transparent pointer-events-none -z-10"></div>
    </div>
  );
}