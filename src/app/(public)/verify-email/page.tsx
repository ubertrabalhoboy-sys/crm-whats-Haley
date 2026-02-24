"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "../../../lib/supabase/browser";
import CursorFollowButton from "../../../components/public/CursorFollowButton";

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
    <div className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-4 py-10">
      <div className="glass-panel glass-card w-full overflow-hidden rounded-3xl shadow-2xl shadow-black/40">
        <div className="border-b border-white/10 bg-white/5 px-8 py-10 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 shadow-lg shadow-orange-500/25" />
          </div>

          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Verifique seu email
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Confirme seu endereço para liberar o acesso completo.
          </p>
        </div>

        <div className="p-8">
          <h2 className="text-2xl font-semibold text-white">Confirmação necessária</h2>
          <p className="mt-2 text-sm text-slate-300">
            Para liberar recursos críticos do SaaS, confirme seu endereço de email.
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Após a confirmação, o acesso completo será liberado automaticamente.
          </p>

          <CursorFollowButton
            type="button"
            onClick={resend}
            disabled={loading}
            variant="primary"
            className="mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold"
          >
            {loading ? "Reenviando..." : "Reenviar email"}
          </CursorFollowButton>

          {message && (
            <p className="mt-4 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-slate-200">
              {message}
            </p>
          )}

          <div className="mt-6 text-center text-xs text-slate-400">
            Se não aparecer, cheque também spam e promoções.
          </div>
        </div>
      </div>
    </div>
  );
}
