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
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>

            <h1 className="text-4xl font-medium tracking-tight text-white sm:text-5xl">
              Criar conta
            </h1>
            <p className="mt-2 text-sm font-light text-white/75">
              Cadastre seu usuário e comece a usar o CRM.
            </p>
          </div>

          {/* steps (visual) */}
          <div className="mt-2 flex items-center gap-3">
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

        {/* form section */}
        <div className="relative p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-medium text-white">Vamos começar</h2>
            <p className="mt-1 text-sm font-normal text-white/70">
              Use um email válido. Você pode precisar confirmar depois.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="mb-2 block text-sm font-medium text-white">
                Email
              </label>
              <div className="relative overflow-hidden rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 to-white/5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@dominio.com"
                  className="relative w-full bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/50 outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-2 block text-sm font-medium text-white">
                Senha
              </label>
              <div className="relative overflow-hidden rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 to-white/5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="relative w-full bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/50 outline-none"
                />
              </div>
            </div>

            {/* error / message */}
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

            {/* submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full overflow-hidden rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-60"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? "Criando..." : "Continuar"}
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
            </div>
          </form>

          {/* footer */}
          <div className="mt-6 text-center">
            <p className="text-sm font-normal text-white/70">
              Já tem conta?
              <Link
                href="/login"
                className="ml-1 font-semibold text-white underline underline-offset-4 hover:opacity-85"
              >
                Entrar
              </Link>
            </p>

            <div className="mt-3 flex items-center justify-center gap-3 text-xs text-white/50">
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="hover:text-white/70"
              >
                Ajuda
              </a>
              <span>•</span>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="hover:text-white/70"
              >
                Suporte
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}