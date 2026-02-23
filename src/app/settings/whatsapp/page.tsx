"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ConnectResponse = {
  ok: boolean;
  mode?: "qr" | "pairing";
  qrcode?: string;
  paircode?: string;
  status?: string | null;
  error?: string;
};

type StatusResponse = {
  ok: boolean;
  status?: unknown;
  connected?: boolean;
  loggedIn?: boolean;
  qrcode?: string;
  paircode?: string;
  jid?: string;
  error?: string;
};

type WebhookResponse = {
  ok: boolean;
  configured?: boolean;
  url?: string | null;
  events?: string[];
  error?: string;
};

type InspectWebhookResponse = {
  ok: boolean;
  webhook?: any;
  error?: string;
};

type StatusObject = {
  connected?: boolean;
  loggedIn?: boolean;
  jid?: string;
  status?: string;
};

function normalizeStatus(value: unknown): {
  text: string;
  connected?: boolean;
  loggedIn?: boolean;
  jid?: string;
} {
  if (typeof value === "string") return { text: value };
  if (value && typeof value === "object") {
    const obj = value as StatusObject;
    const text =
      typeof obj.status === "string"
        ? obj.status
        : obj.connected === true
          ? "connected"
          : obj.connected === false
            ? "disconnected"
            : "unknown";
    return { text, connected: obj.connected, loggedIn: obj.loggedIn, jid: obj.jid };
  }
  return { text: "disconnected" };
}

function asStatusString(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const obj = value as StatusObject;
    if (typeof obj.status === "string" && obj.status.trim()) return obj.status;
    if (obj.connected === true) return "connected";
    if (obj.connected === false) return "disconnected";
  }
  return "disconnected";
}

export default function WhatsAppSettingsPage() {
  const [phone, setPhone] = useState("");
  const [statusText, setStatusText] = useState<string>("disconnected");
  const [jid, setJid] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [paircode, setPaircode] = useState<string | null>(null);
  const [loadingEnsure, setLoadingEnsure] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);
  const [loadingPairing, setLoadingPairing] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingWebhookConfig, setLoadingWebhookConfig] = useState(false);
  const [loadingWebhookStatus, setLoadingWebhookStatus] = useState(false);
  const [loadingWebhookInspect, setLoadingWebhookInspect] = useState(false);
  const [webhookConfigured, setWebhookConfigured] = useState<boolean | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>("/api/webhook/uazapi");
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [webhookInspect, setWebhookInspect] = useState<any>(null);
  const [webhookFeedback, setWebhookFeedback] = useState<string | null>(null);
  const [instanceFeedback, setInstanceFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasVisualCode = useMemo(() => !!qrcode || !!paircode, [qrcode, paircode]);
  const isConnecting = statusText === "connecting";
   async function refreshStatus() {
    setLoadingStatus(true);
    const res = await fetch("/api/whatsapp/status", { cache: "no-store" });
    const json = (await res.json()) as StatusResponse;
    setLoadingStatus(false);

    if (!json.ok) {
      setError(json.error || "status_failed");
      return;
    }

    setError(null);
    const normalized = normalizeStatus(json.status);
    setStatusText(normalized.text);
    setConnected(normalized.connected ?? !!json.connected);
    setLoggedIn(normalized.loggedIn ?? !!json.loggedIn);
    setJid(normalized.jid ?? null);
	}

  async function ensureInstance() {
    setLoadingEnsure(true);
    setError(null);
    setInstanceFeedback(null);
    const res = await fetch("/api/whatsapp/instance/ensure?force=1", { method: "POST" });
    const json = await res.json();
    setLoadingEnsure(false);

    if (!json.ok) {
      setError(json.error || "ensure_failed");
      return false;
    }

    const normalized = normalizeStatus(json.status);
    setStatusText(normalized.text);
    setJid(normalized.jid ?? null);
    setQrcode(null);
    setPaircode(null);
    setInstanceFeedback("Instância recriada. Agora gere o QR Code.");
    return true;
  }

  async function connect(mode: "qr" | "pairing", maybePhone?: string) {
    setError(null);
    if (mode === "qr") setLoadingQr(true);
    if (mode === "pairing") setLoadingPairing(true);

    const res = await fetch("/api/whatsapp/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "pairing" ? { phone: maybePhone } : {}),
    });

    const json = (await res.json()) as ConnectResponse;

    setLoadingQr(false);
    setLoadingPairing(false);

    if (!json.ok) {
      setError(json.error || "connect_failed");
      return;
    }

    setStatusText(asStatusString(json.status) || "connecting"); setStatusText("connecting");
    setJid(null);
    setConnected(false);
    setLoggedIn(false);
    setQrcode(json.qrcode || null);
    setPaircode(json.paircode || null);
	}

  async function configureWebhook() {
    setLoadingWebhookConfig(true);
    setError(null);
    setWebhookFeedback(null);

    const res = await fetch("/api/whatsapp/webhook/configure", { method: "POST" });
    const json = (await res.json()) as WebhookResponse;

    setLoadingWebhookConfig(false);

    if (!json.ok) {
      setError(json.error || "webhook_config_failed");
      return;
    }

    setError(null);
    setWebhookConfigured(true);
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/api/webhook/uazapi`);
    }
    setWebhookFeedback("Webhook configurado");
  }

  async function refreshWebhookStatus() {
    setLoadingWebhookStatus(true);
    const res = await fetch("/api/whatsapp/webhook/configure", { cache: "no-store" });
    const json = (await res.json()) as WebhookResponse;
    setLoadingWebhookStatus(false);

    if (!json.ok) {
      setError(json.error || "webhook_status_failed");
      return;
    }

    setError(null);
    setWebhookFeedback(null);
    setWebhookConfigured(typeof json.configured === "boolean" ? json.configured : null);
    setWebhookUrl((prev) => (typeof json.url === "string" ? json.url : prev));
    setWebhookEvents(Array.isArray(json.events) ? json.events : []);
  }

  async function inspectWebhook() {
    setLoadingWebhookInspect(true);
    setError(null);
    setWebhookFeedback(null);

    const res = await fetch("/api/whatsapp/webhook/inspect", { cache: "no-store" });
    const json = (await res.json()) as InspectWebhookResponse;
    setLoadingWebhookInspect(false);

    if (!json.ok) {
      setError(json.error || "webhook_inspect_failed");
      return;
    }

    setWebhookInspect(json.webhook ?? null);
  }

  function handlePairing(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    connect("pairing", phone.trim() || undefined);
  }

  useEffect(() => {
    refreshStatus().catch(() => setError("status_failed"));
    refreshWebhookStatus().catch(() => null);
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/api/webhook/uazapi`);
    }
  }, []);

  useEffect(() => {
    if (!isConnecting) return;

    const timer = setInterval(() => {
      refreshStatus().catch(() => null);
    }, 2000);

    return () => clearInterval(timer);
  }, [isConnecting]);

  const qrImageSrc =
    qrcode && (qrcode.startsWith("data:image") || /^[A-Za-z0-9+/=\r\n]+$/.test(qrcode))
      ? qrcode.startsWith("data:image")
        ? qrcode
        : `data:image/png;base64,${qrcode.replace(/\s+/g, "")}`
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Conectar WhatsApp</h1>
        <p className="mt-1 text-sm text-slate-500">
          Fluxo seguro via backend. Nenhum token é exposto no frontend.
        </p>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p>
            <span className="font-medium text-slate-700">Status:</span> {statusText}
          </p>
          {jid && (
            <p className="mt-1">
              <span className="font-medium text-slate-700">JID:</span> {jid}
            </p>
          )}
          <p className="mt-1">
            <span className="font-medium text-slate-700">Connected:</span>{" "}
            {connected ? "true" : "false"}
          </p>
          <p className="mt-1">
            <span className="font-medium text-slate-700">LoggedIn:</span>{" "}
            {loggedIn ? "true" : "false"}
          </p>
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        {instanceFeedback && <p className="mt-3 text-sm text-emerald-600">{instanceFeedback}</p>}
        {webhookFeedback && <p className="mt-3 text-sm text-emerald-600">{webhookFeedback}</p>}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => ensureInstance()}
            disabled={loadingEnsure || loadingQr || loadingPairing}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
          >
            {loadingEnsure ? "Criando..." : "Criar instância"}
          </button>
          <button
            onClick={() => connect("qr")}
            disabled={loadingEnsure || loadingQr || loadingPairing}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loadingQr ? "Gerando..." : "Gerar QR Code"}
          </button>
          <button
            onClick={() => refreshStatus()}
            disabled={loadingStatus}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
          >
            {loadingStatus ? "Atualizando..." : "Atualizar status"}
          </button>
          <button
            onClick={() => configureWebhook()}
            disabled={loadingWebhookConfig || loadingWebhookStatus}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
          >
            {loadingWebhookConfig ? "Configurando..." : "Configurar Webhook"}
          </button>
          <button
            onClick={() => refreshWebhookStatus()}
            disabled={loadingWebhookStatus || loadingWebhookConfig}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
          >
            {loadingWebhookStatus ? "Atualizando webhook..." : "Atualizar webhook"}
          </button>
          <button
            onClick={() => inspectWebhook()}
            disabled={loadingWebhookInspect}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
          >
            {loadingWebhookInspect ? "Inspecionando..." : "Inspecionar Webhook"}
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p>
            <span className="font-medium text-slate-700">Webhook:</span>{" "}
            {webhookConfigured === null ? "desconhecido" : webhookConfigured ? "configurado" : "nao configurado"}
          </p>
          {webhookUrl && (
            <p className="mt-1 break-all">
              <span className="font-medium text-slate-700">URL:</span> {webhookUrl}
            </p>
          )}
          {webhookEvents.length > 0 && (
            <p className="mt-1 break-all">
              <span className="font-medium text-slate-700">Eventos:</span> {webhookEvents.join(", ")}
            </p>
          )}
        </div>

        {webhookInspect !== null && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="mb-2 font-medium text-slate-700">Webhook JSON</p>
            <pre className="overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              {String(JSON.stringify(webhookInspect, null, 2) ?? "")}
            </pre>
          </div>
        )}

        <form onSubmit={handlePairing} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">Phone (opcional)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="5511999999999"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <button
            type="submit"
            disabled={loadingEnsure || loadingQr || loadingPairing}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
          >
            {loadingPairing ? "Gerando..." : "Gerar Código de Pareamento"}
          </button>
        </form>
      </div>

      {hasVisualCode && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {qrcode && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">QR Code</p>
              {qrImageSrc ? (
                <img
                  src={qrImageSrc}
                  alt="QR Code"
                  className="h-64 w-64 rounded-lg border border-slate-200 bg-white p-2"
                />
              ) : (
                <>
                  <p className="mb-2 text-xs text-slate-500">
                    QR em texto: escaneie com o WhatsApp.
                  </p>
                  <pre className="overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                    {qrcode}
                  </pre>
                </>
              )}
            </div>
          )}

          {paircode && (
            <div className={qrcode ? "mt-5" : ""}>
              <p className="mb-2 text-sm font-medium text-slate-700">Código de pareamento</p>
              <div className="rounded-xl bg-slate-100 px-4 py-3 font-mono text-2xl font-semibold tracking-wider text-slate-900">
                {paircode}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}