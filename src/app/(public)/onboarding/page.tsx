"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/create-restaurant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...(vertical !== "auto" ? { vertical } : {}),
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "onboarding_failed");
        setLoading(false);
        return;
      }

      router.replace("/inbox");
      router.refresh();
    } catch {
      setError("onboarding_failed");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Onboarding</h1>
        <p className="mt-1 text-sm text-slate-500">Crie seu restaurante para começar.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Nome do restaurante
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Tipo da loja (vertical)
            </label>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-slate-400 bg-white"
            >
              <option value="auto">Automático (detectar pelo nome)</option>
              <option value="burger">Hambúrguer</option>
              <option value="acai">Açaí</option>
              <option value="pizza">Pizza</option>
              <option value="sushi">Sushi</option>
              <option value="generic">Genérico</option>
            </select>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "Criando..." : "Criar"}
          </button>
        </form>
      </div>
    </div>
  );
}
