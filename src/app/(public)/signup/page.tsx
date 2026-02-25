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
    <div className="relative min-h-screen flex items-center justify-center bg-[#050505] font-sans selection:bg-[#25D366]/30">
      {/* Background Spline */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
        <iframe
          src="https://my.spline.design/crystalball-de222de54d6fc4752fa850b54fb654de/"
          className="h-full w-full border-none"
          title="Fundo 3D"
        />
      </div>

      <main className="relative z-10 w-full max-w-[460px] p-6">
        <div className="bg-black/40 backdrop-blur-3xl border border-white/10 shadow-2xl rounded-[40px] p-10 overflow-hidden">
          {/* Header */}
          <header className="flex flex-col items-center mb-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-inner">
              <div className="w-8 h-8 rounded-full border-2 border-[#25D366] flex items-center justify-center">
                <div className="w-2 h-2 bg-[#25D366] rounded-full shadow-[0_0_10px_#25D366]" />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-white tracking-tight">
              Criar conta
            </h1>

            <p className="text-sm text-white/70 mt-1">
              Já tem conta?{" "}
              <Link
                href="/login"
                className="text-[#25D366] font-bold hover:underline"
              >
                Entrar
              </Link>
            </p>
          </header>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-white uppercase tracking-widest ml-1 opacity-70">
                Email
              </label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-[#25D366] transition-colors">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </span>

                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-[#25D366]/50 focus:bg-white/10 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-white uppercase tracking-widest ml-1 opacity-70">
                Senha
              </label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-[#25D366] transition-colors">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </span>

                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-[#25D366]/50 focus:bg-white/10 transition-all"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </p>
            )}

            {message && (
              <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {message}
              </p>
            )}

            <CursorFollowButton
              type="submit"
              disabled={loading}
              variant="primary"
              className="w-full rounded-2xl py-4 font-bold shadow-[0_0_20px_rgba(37,211,102,0.20)] hover:shadow-[0_0_30px_rgba(37,211,102,0.40)]"
            >
              {loading ? "Criando..." : "Criar conta"}
            </CursorFollowButton>

            <p className="text-center text-sm text-white/60">
              Já tem conta?{" "}
              <Link href="/login" className="text-white hover:text-white/90 underline">
                Entrar
              </Link>
            </p>
          </form>

          <footer className="mt-10 text-[10px] text-white/40 text-center leading-relaxed">
            Ao continuar, você concorda com os{" "}
            <a href="#" className="text-white/60 hover:text-white underline">
              Termos
            </a>{" "}
            e a{" "}
            <a href="#" className="text-white/60 hover:text-white underline">
              Política de Privacidade
            </a>
            .
          </footer>
        </div>
      </main>
    </div>
  );
}