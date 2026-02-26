"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, QrCode, Smartphone, SmartphoneNfc, Unplug, Zap } from "lucide-react";

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

export default function WhatsAppSettingsPage() {
  const [phone, setPhone] = useState("");
  const [statusText, setStatusText] = useState<string>("disconnected");
  const [connected, setConnected] = useState(false);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [paircode, setPaircode] = useState<string | null>(null);

  const [loadingEnsure, setLoadingEnsure] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);
  const [loadingPairing, setLoadingPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track if we already triggered the auto-webhook for this connection session
  const [webhookConfigured, setWebhookConfigured] = useState(false);

  const isConnecting = statusText === "connecting";
  const isOnline = statusText === "open" || statusText === "connected";

  async function refreshStatus() {
    const res = await fetch("/api/whatsapp/status", { cache: "no-store" });
    const json = (await res.json()) as StatusResponse;

    if (!json.ok) return;

    const normalized = normalizeStatus(json.status);
    setStatusText(normalized.text);
    setConnected(normalized.connected ?? !!json.connected);
  }

  // Auto Webhook Setup 
  useEffect(() => {
    if (isOnline && !webhookConfigured) {
      // Silently configure the webhook in the background once connected
      fetch("/api/whatsapp/webhook/configure", { method: "POST" })
        .then(res => res.json())
        .then(data => {
          if (data.ok) setWebhookConfigured(true);
        })
        .catch(() => console.error("Falha silenciosa ao configurar webhook em background"));
    }

    // Reset the tracker if disconnected
    if (!isOnline) {
      setWebhookConfigured(false);
    }
  }, [isOnline, webhookConfigured]);

  async function ensureInstanceAndConnect(mode: "qr" | "pairing") {
    setError(null);
    if (mode === "qr") setLoadingQr(true);
    else setLoadingPairing(true);
    setLoadingEnsure(true);

    // 1. Force ensure instance first
    const ensureRes = await fetch("/api/whatsapp/instance/ensure?force=1", { method: "POST" });
    const ensureJson = await ensureRes.json();

    if (!ensureJson.ok) {
      setError(ensureJson.error || "Falha ao criar instância.");
      setLoadingEnsure(false);
      setLoadingQr(false);
      setLoadingPairing(false);
      return;
    }

    setLoadingEnsure(false);

    // 2. Connect
    const res = await fetch("/api/whatsapp/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "pairing" ? { phone: phone.trim() } : {}),
    });

    const json = (await res.json()) as ConnectResponse;

    setLoadingQr(false);
    setLoadingPairing(false);

    if (!json.ok) {
      setError(json.error || "Falha ao conectar.");
      return;
    }

    setStatusText("connecting");
    setConnected(false);
    setQrcode(json.qrcode || null);
    setPaircode(json.paircode || null);
  }

  async function disconnectInstance() {
    if (!confirm("Tem certeza que deseja desconectar este dispositivo? Você irá parar de receber e enviar mensagens.")) return;

    setError(null);
    try {
      // A quick hack since we don't have a direct disconnect route, normally removing the instance or logging out works.
      // Creating a new instance with force=1 essentially logs out the old session.
      await fetch("/api/whatsapp/instance/ensure?force=1", { method: "POST" });
      setStatusText("disconnected");
      setConnected(false);
      setQrcode(null);
      setPaircode(null);
      setWebhookConfigured(false);
    } catch (err) {
      setError("Erro ao tentar desconectar.");
    }
  }

  useEffect(() => {
    refreshStatus().catch(() => setError("Falha ao buscar status atual."));
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
    <div className="relative h-full flex flex-col overflow-y-auto custom-scroll w-full px-2 pb-6">
      {/* Pattern de fundo */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.03] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />

      {/* Header */}
      <div className="mb-8 mt-2 flex items-center justify-between rounded-[2.5rem] border border-white/60 bg-white/40 px-8 py-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl relative z-10 shrink-0 mx-2">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
            <Smartphone size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-[950] uppercase tracking-tighter text-emerald-900 leading-none">
              Conexão do Dispositivo
            </h1>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-teal-600">
              Gerencie o WhatsApp Oficial do Sistema
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-2 relative z-10">

        {/* STATUS CARD PRINCIPAL */}
        <div className="flex flex-col p-8 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-emerald-900/5 rounded-[2.5rem]">
          <h2 className="text-[12px] font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
            <Zap size={16} className="text-emerald-500" />
            Status da Rede
          </h2>

          <div className="flex flex-col items-center justify-center py-6 text-center">
            {isOnline ? (
              <>
                <div className="relative">
                  <div className="absolute inset-0 bg-emerald-400 blur-xl opacity-40 rounded-full animate-pulse"></div>
                  <div className="h-24 w-24 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-emerald-500/30 relative z-10 mb-6">
                    <SmartphoneNfc size={40} />
                  </div>
                </div>
                <h3 className="text-3xl font-black text-emerald-600 uppercase tracking-tighter">Online</h3>
                <p className="text-sm font-semibold text-emerald-800/60 mt-2 max-w-xs">
                  O Robô está ativo! Automações de Roleta, CRM e Envios em Massa estão operando normalmente.
                </p>

                <button
                  onClick={disconnectInstance}
                  className="mt-8 px-6 py-3 rounded-2xl bg-red-50 text-red-600 font-bold border border-red-100 hover:bg-red-500 hover:text-white transition-all duration-300 shadow-sm flex items-center gap-2"
                >
                  <Unplug size={18} />
                  Desconectar Dispositivo
                </button>
              </>
            ) : (
              <>
                <div className="relative">
                  <div className="h-24 w-24 bg-gradient-to-br from-red-400 to-rose-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-red-500/30 relative z-10 mb-6">
                    <Unplug size={40} />
                  </div>
                </div>
                <h3 className="text-3xl font-black text-red-600 uppercase tracking-tighter">Desconectado</h3>
                <p className="text-sm font-semibold text-red-800/60 mt-2 max-w-xs">
                  O sistema está paralisado. Conecte um aparelho ao lado para reativar as automações de vendas imediatamente.
                </p>
              </>
            )}

            {error && (
              <div className="mt-6 w-full p-4 bg-red-50 border border-red-100 text-red-600 text-sm font-bold rounded-xl">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* PAINEL DE CONEXÃO (Apenas visível se offline ou conectando) */}
        {!isOnline && (
          <div className="flex flex-col p-8 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-emerald-900/5 rounded-[2.5rem]">

            {!qrcode && !paircode ? (
              // ESTADO INICIAL DE PAREAMENTO
              <>
                <h2 className="text-[12px] font-black uppercase tracking-widest text-slate-500 mb-6 font-sans">
                  Vincular Aparelho
                </h2>

                <div className="flex-1 flex flex-col justify-center">
                  <button
                    onClick={() => ensureInstanceAndConnect("qr")}
                    disabled={loadingQr || loadingEnsure}
                    className="w-full h-20 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl text-white font-black uppercase tracking-widest shadow-lg shadow-emerald-500/30 hover:scale-[1.02] hover:shadow-emerald-500/50 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:hover:scale-100"
                  >
                    <QrCode size={24} />
                    {loadingQr ? "Iniciando..." : "Gerar QR Code"}
                  </button>

                  <div className="relative flex items-center py-6">
                    <div className="flex-grow border-t border-slate-200"></div>
                    <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold uppercase tracking-widest">ou código no app</span>
                    <div className="flex-grow border-t border-slate-200"></div>
                  </div>

                  <form onSubmit={(e) => { e.preventDefault(); ensureInstanceAndConnect("pairing"); }} className="flex flex-col gap-3">
                    <input
                      required
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ex: 5511999999999"
                      className="w-full text-center rounded-2xl border border-white bg-white/80 px-4 py-4 text-lg font-black tracking-widest text-slate-800 shadow-sm outline-none transition-all focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                    />
                    <button
                      type="submit"
                      disabled={loadingPairing || loadingEnsure || !phone}
                      className="w-full py-4 bg-white text-emerald-600 font-black uppercase tracking-widest rounded-2xl border border-emerald-100 hover:bg-emerald-50 transition-colors shadow-sm disabled:opacity-50 disabled:hover:bg-white"
                    >
                      {loadingPairing ? "Solicitando..." : "Receber Código no WhatsApp"}
                    </button>
                  </form>
                </div>
              </>
            ) : (
              // TELA DO QR CODE OU CÓDIGO
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <h2 className="text-lg font-bold text-slate-800 mb-2">
                  {paircode ? "Aguardando Vínculo" : "Escaneie o QR Code"}
                </h2>
                <p className="text-sm text-slate-500 mb-8 max-w-xs">
                  Abra o WhatsApp no celular, vá em "Aparelhos Conectados" e siga as instruções para o pareamento.
                </p>

                {qrcode && qrImageSrc && (
                  <div className="p-4 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 mb-6">
                    <img src={qrImageSrc} alt="QR Code" className="h-56 w-56 rounded-xl" />
                  </div>
                )}

                {paircode && (
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Seu Código</p>
                    <div className="text-4xl font-black tracking-[0.2em] text-emerald-600 bg-white py-4 rounded-xl shadow-sm border border-emerald-100 flex items-center justify-center gap-4 relative group cursor-pointer transition-colors hover:border-emerald-300">
                      {paircode}
                      <div className="absolute right-4 text-emerald-400 opacity-50 group-hover:opacity-100 transition-opacity">
                        <Copy size={20} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <p className="text-xs font-bold text-emerald-500 mt-4 uppercase tracking-widest">
                  {isConnecting ? "Validando conexão..." : "Aguardando Leitura..."}
                </p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
