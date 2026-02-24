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
    <div className="mx-auto max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Verifique seu email</h1>
      <p className="mt-2 text-sm text-slate-600">
        Para liberar recursos críticos do SaaS, confirme seu endereço de email.
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Após a confirmação, o acesso completo será liberado automaticamente.
      </p>

      <button
        type="button"
        onClick={resend}
        disabled={loading}
        className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "Reenviando..." : "Reenviar"}
      </button>

      {message && <p className="mt-3 text-sm text-slate-700">{message}</p>}
    </div>
  );
}
