"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createSupabaseBrowser } from "../../../lib/supabase/browser";
import CursorFollowButton from "../../../components/public/CursorFollowButton";

function mapSignupError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("already registered")) {
    return "Este email já está cadastrado.";
  }
  if (normalized.includes("password")) {
    return "Senha inválida. Use uma senha mais forte.";
  }
  return "Não foi possível criar sua conta. Tente novamente.";
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (signUpError) {
      setError(mapSignupError(signUpError.message));
      return;
    }

    if (data.user?.id) {
      await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          email_verified: false,
        },
        { onConflict: "id" }
      );
    }

    if (!data.session) {
      setMessage("Conta criada. Verifique seu email para confirmar o acesso.");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-4 py-10">
      <div className="glass-panel glass-card w-full overflow-hidden rounded-3xl shadow-2xl shadow-black/40">
        <div className="border-b border-white/10 bg-white/5 px-8 py-10 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 shadow-lg shadow-orange-500/25" />
          </div>

          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Criar conta</h1>
          <p className="mt-2 text-sm text-slate-300">Comece a operar seu CRM de WhatsApp hoje.</p>
        </div>

        <div className="p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-white">Abra sua conta</h2>
            <p className="mt-1 text-sm text-slate-300">Use um email válido para receber confirmação e acesso.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">Email</label>
              <div className="glass-panel-strong overflow-hidden rounded-xl">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@dominio.com"
                  className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">Senha</label>
              <div className="glass-panel-strong overflow-hidden rounded-xl">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </p>
            )}
            {message && (
              <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {message}
              </p>
            )}

            <CursorFollowButton
              type="submit"
              disabled={loading}
              variant="primary"
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold"
            >
              {loading ? "Criando..." : "Continuar"}
            </CursorFollowButton>
          </form>

          <p className="mt-6 text-center text-sm text-slate-300">
            Já tem conta?{" "}
            <Link href="/login" className="font-semibold text-white underline underline-offset-4 hover:opacity-85">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
