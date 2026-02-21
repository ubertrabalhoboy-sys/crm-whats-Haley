"use client";

import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export default function VerifyEmailActions() {
  const supabase = createSupabaseBrowser();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    setSending(true);
    setMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setMessage("Não foi possível identificar seu email.");
      setSending(false);
      return;
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: user.email,
    });

    setSending(false);
    setMessage(error ? "Falha ao reenviar. Tente novamente." : "Email de verificação reenviado.");
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Link
        href="/verify-email"
        className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
      >
        Verificar agora
      </Link>
      <button
        type="button"
        onClick={resend}
        disabled={sending}
        className="rounded-md border border-amber-700/30 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-60"
      >
        {sending ? "Reenviando..." : "Reenviar"}
      </button>
      {message && <span className="text-xs text-amber-900">{message}</span>}
    </div>
  );
}
