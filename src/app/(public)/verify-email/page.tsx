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
      <div className="wa-card w-full overflow-hidden rounded-3xl shadow-xl shadow-emerald-900/10">
        <div className="border-b wa-divider bg-white/35 px-8 py-10 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border wa-divider bg-white/45 backdrop-blur-xl">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#128C7E] to-[#25D366] shadow-lg shadow-emerald-500/20" />
          </div>

          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Verifique seu email</h1>
          <p className="mt-2 text-sm text-slate-600">Confirme seu endereço para liberar o acesso completo.</p>
        </div>

        <div className="p-8">
          <h2 className="text-2xl font-semibold text-slate-900">Confirmação necessária</h2>
          <p className="mt-2 text-sm text-slate-600">Para liberar recursos críticos do SaaS, confirme seu endereço de email.</p>
          <p className="mt-1 text-sm text-slate-600">Após a confirmação, o acesso completo será liberado automaticamente.</p>

          <CursorFollowButton type="button" onClick={resend} disabled={loading} variant="primary" className="mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold">
            {loading ? "Reenviando..." : "Reenviar email"}
          </CursorFollowButton>

          {message && (
            <p className="mt-4 rounded-xl border wa-divider bg-white/40 px-4 py-3 text-sm text-slate-700">{message}</p>
          )}

          <div className="mt-6 text-center text-xs text-slate-500">Se não aparecer, cheque também spam e promoções.</div>
        </div>
      </div>
    </div>
  );
}
