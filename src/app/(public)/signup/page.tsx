"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

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
        {/* top */}
        <div className="bg-black/10 px-8 py-10 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 shadow-lg shadow-orange-500/20" />
          </div>

          <h1 className="text-4xl font-medium tracking-tight text-white sm:text-5xl">
            Criar conta
          </h1>
          <p className="mt-2 text-sm font-light text-white/75">
            Cadastre seu usuário e comece a usar o CRM.
          </p>

          <div className="mt-4 flex items-center justify-center gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-xs font-semibold text-white backdrop-blur-sm">
                1
              </div>
              <span className="hidden text-xs font-medium text-white/90 sm:block">
                Conta
              </span>
            </div>
            <div className="h-px w-6 bg-white/30" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-semibold text-white/80 backdrop-blur-sm">
                2
              </div>
              <span className="hidden text-xs font-medium text-white/60 sm:block">
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

        {/* form */}
        <div className="p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-medium text-white">Vamos começar</h2>
            <p className="mt-1 text-sm font-normal text-white/70">
              Use um email válido. Você pode precisar confirmar depois.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-white">
                Email
              </label>
              <div className="glass-panel-strong overflow-hidden rounded-xl">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@dominio.com"
                  className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/50 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white">
                Senha
              </label>
              <div className="glass-panel-strong overflow-hidden rounded-xl">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/50 outline-none"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </p>
            )}
            {message && (
              <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="glass-button w-full rounded-xl px-4 py-3 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
            >
              {loading ? "Criando..." : "Continuar"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm font-normal text-white/70">
            Já tem conta?{" "}
            <Link
              href="/login"
              className="font-semibold text-white underline underline-offset-4 hover:opacity-85"
            >
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}