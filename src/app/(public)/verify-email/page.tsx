"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export default function VerifyEmailPage() {
  const supabase = createSupabaseBrowser();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    setLoading(true);
    setMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setMessage("Não foi possível identificar o usuário logado.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: user.email,
    });

    setLoading(false);
    setMessage(error ? "Falha ao reenviar email." : "Email de verificação reenviado.");
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-cover bg-center px-4 py-10"
      style={{
        backgroundImage:
          "url(https://images.unsplash.com/photo-1635151227785-429f420c6b9d?w=2160&q=80)",
      }}
    >
      {/* overlays */}
      <div className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/60" />

      {/* card */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/15 bg-white/10 shadow-2xl backdrop-blur-xl">
        {/* inner highlight (glass edge) */}
        <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-white/20" />
        <div className="pointer-events-none absolute inset-0 rounded-3xl [box-shadow:inset_2px_2px_1px_0_rgba(255,255,255,0.35),inset_-1px_-1px_1px_1px_rgba(255,255,255,0.20)]" />

        {/* top section */}
        <div className="relative flex flex-col items-center justify-center bg-black/10 px-8 py-10 text-center">
          <div className="mb-4">
            <div className="relative mx-auto mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/30 to-white/10" />
              <div className="pointer-events-none absolute inset-0 [box-shadow:inset_3px_3px_2px_0_rgba(255,255,255,0.35),inset_-2px_-2px_2px_2px_rgba(255,255,255,0.18)] rounded-2xl" />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="relative text-white"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="M22 4 12 14.01l-3-3" />
              </svg>
            </div>

            <h1 className="text-4xl font-medium tracking-tight text-white sm:text-5xl">
              Verifique seu email
            </h1>
            <p className="mt-2 text-sm font-light text-white/75">
              Confirme seu endereço para liberar o acesso completo.
            </p>
          </div>

          {/* steps (visual) */}
          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-xs font-semibold text-white backdrop-blur-sm">
                1
              </div>
              <span className="hidden text-xs font-medium text-white/90 sm:block">
                Cadastro
              </span>
            </div>
            <div className="h-px w-6 bg-white/30" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-xs font-semibold text-white backdrop-blur-sm">
                2
              </div>
              <span className="hidden text-xs font-medium text-white/90 sm:block">
                Verificação
              </span>
            </div>
            <div className="h-px w-6 bg-white/30" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-semibold text-white/80 backdrop-blur-sm">
                3
              </div>
              <span className="hidden text-xs font-medium text-white/60 sm:block">
                Dashboard
              </span>
            </div>
          </div>
        </div>

        {/* content */}
        <div className="relative p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-medium text-white">
              Confirmação necessária
            </h2>
            <p className="mt-2 text-sm text-white/70">
              Para liberar recursos críticos do SaaS, confirme seu endereço de email.
            </p>
            <p className="mt-1 text-sm text-white/70">
              Após a confirmação, o acesso completo será liberado automaticamente.
            </p>
          </div>

          <button
            type="button"
            onClick={resend}
            disabled={loading}
            className="group relative w-full overflow-hidden rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-60"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? "Reenviando..." : "Reenviar email"}
              <svg
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                className="opacity-80 transition group-hover:translate-x-0.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </span>
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/25 to-white/10 opacity-80" />
          </button>

          {message && (
            <p className="mt-4 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white/85">
              {message}
            </p>
          )}

          <div className="mt-6 text-center text-xs text-white/55">
            Se não aparecer, cheque também o spam e promoções.
          </div>
        </div>
      </div>
    </div>
  );
}