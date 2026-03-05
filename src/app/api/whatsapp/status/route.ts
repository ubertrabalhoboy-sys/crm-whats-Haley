import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  UAZAPI_BASE_URL,
  UAZAPI_GLOBAL_API_KEY,
} from "@/lib/shared/env";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusReasonCode =
  | "CONNECTING"
  | "WAITING_PAIR"
  | "PHONE_OFFLINE"
  | "PHONE_NETWORK_UNSTABLE"
  | "PHONE_BATTERY_LOW"
  | "TOKEN_INVALID"
  | "INSTANCE_LIMIT"
  | "UPSTREAM_ERROR"
  | "DISCONNECTED_UNKNOWN";

const CONNECTED_STATUSES = new Set(["connected", "open", "ready", "online"]);
const PROACTIVE_REASON_CODES = new Set<StatusReasonCode>([
  "PHONE_NETWORK_UNSTABLE",
  "PHONE_BATTERY_LOW",
  "PHONE_OFFLINE",
  "TOKEN_INVALID",
  "INSTANCE_LIMIT",
  "UPSTREAM_ERROR",
]);

function parseJsonSafe(text: string): unknown {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readPath(root: unknown, path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    const record = readObject(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickString(root: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const value = readString(readPath(root, path));
    if (value) return value;
  }
  return null;
}

function pickBoolean(root: unknown, paths: string[][]): boolean | null {
  for (const path of paths) {
    const value = readBoolean(readPath(root, path));
    if (value !== null) return value;
  }
  return null;
}

function pickNumber(root: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    const value = readNumber(readPath(root, path));
    if (value !== null) return value;
  }
  return null;
}

function extractStatusFromPayload(data: unknown, fallbackStatus: string | null): string {
  const directStatus = pickString(data, [
    ["instance", "state"],
    ["instance", "status"],
    ["state"],
    ["status"],
    ["data", "status"],
  ]);

  if (directStatus) return directStatus.toLowerCase();

  const objectStatus = readObject(readPath(data, ["status"]));
  if (objectStatus) {
    const objectStateValue = readString(objectStatus.state) ?? readString(objectStatus.status);
    if (objectStateValue) return objectStateValue.toLowerCase();
  }

  return String(fallbackStatus || "disconnected").toLowerCase();
}

function deriveReasonCode(params: {
  upstreamHealthy: boolean;
  upstreamStatusCode: number;
  normalizedStatus: string;
  connected: boolean;
  loggedIn: boolean;
  rawReason: string | null;
}): StatusReasonCode | null {
  const reason = (params.rawReason || "").toLowerCase();
  const status = params.normalizedStatus.toLowerCase();

  if (!params.upstreamHealthy) return "UPSTREAM_ERROR";
  if (params.connected) return null;
  if (reason.includes("token") || reason.includes("unauthorized") || params.upstreamStatusCode === 401) {
    return "TOKEN_INVALID";
  }
  if (reason.includes("max") && reason.includes("instance")) return "INSTANCE_LIMIT";
  if (reason.includes("battery")) return "PHONE_BATTERY_LOW";
  if (
    reason.includes("internet") ||
    reason.includes("network") ||
    reason.includes("timeout") ||
    reason.includes("offline")
  ) {
    return "PHONE_NETWORK_UNSTABLE";
  }
  if (!params.loggedIn && (status.includes("qr") || status.includes("pair"))) return "WAITING_PAIR";
  if (status.includes("connecting")) return "CONNECTING";
  if (status.includes("close") || status.includes("disconnect") || status.includes("offline")) return "PHONE_OFFLINE";
  return "DISCONNECTED_UNKNOWN";
}

function reasonCodeToText(reasonCode: StatusReasonCode | null, fallback: string | null): string | null {
  if (!reasonCode) return null;
  const map: Record<StatusReasonCode, string> = {
    CONNECTING: "Conexao em andamento. Aguarde alguns segundos e atualize o status.",
    WAITING_PAIR: "Aguardando leitura do QR code ou codigo de pareamento no celular.",
    PHONE_OFFLINE: "Celular desconectado do WhatsApp. Reabra o app e mantenha o aparelho online.",
    PHONE_NETWORK_UNSTABLE: "Conexao instavel no celular. Verifique internet/Wi-Fi e tente novamente.",
    PHONE_BATTERY_LOW: "Bateria do celular pode estar baixa. Mantenha o aparelho carregando.",
    TOKEN_INVALID: "Token da instancia invalido ou expirado. Recrie a instancia no painel.",
    INSTANCE_LIMIT: "Limite de instancias atingido no provedor. Delete instancias antigas e gere uma nova.",
    UPSTREAM_ERROR: "Provedor de WhatsApp indisponivel no momento. Sistema usando ultimo estado conhecido.",
    DISCONNECTED_UNKNOWN: "Instancia desconectada por motivo nao identificado.",
  };
  return fallback ? `${map[reasonCode]} Detalhe: ${fallback}` : map[reasonCode];
}

function reasonCodeToHints(reasonCode: StatusReasonCode | null): string[] {
  if (!reasonCode) return [];
  const map: Record<StatusReasonCode, string[]> = {
    CONNECTING: [
      "Aguarde 10-20 segundos antes de tentar novo pareamento.",
      "Se travar, clique em Atualizar Status.",
    ],
    WAITING_PAIR: [
      "No celular: WhatsApp > Aparelhos conectados > Conectar aparelho.",
      "Escaneie o QR ou use o codigo exibido.",
    ],
    PHONE_OFFLINE: [
      "Deixe o celular com internet ativa.",
      "Mantenha o WhatsApp aberto em segundo plano.",
    ],
    PHONE_NETWORK_UNSTABLE: [
      "Troque entre Wi-Fi e 4G/5G para estabilizar.",
      "Evite modo economia agressivo no celular.",
    ],
    PHONE_BATTERY_LOW: [
      "Conecte o carregador no aparelho pareado.",
      "Desative economia de bateria para o WhatsApp.",
    ],
    TOKEN_INVALID: [
      "Use Desconectar e gere uma nova instancia.",
      "Confira se a chave global da UAZAPI esta correta no ambiente.",
    ],
    INSTANCE_LIMIT: [
      "Delete instancias antigas no provedor.",
      "Depois gere novo QR code no painel.",
    ],
    UPSTREAM_ERROR: [
      "Tente novamente em alguns segundos.",
      "Se persistir, verifique status da UAZAPI e rede do servidor.",
    ],
    DISCONNECTED_UNKNOWN: [
      "Tente Atualizar Status e, se preciso, reconecte o aparelho.",
      "Verifique se o celular ainda esta pareado.",
    ],
  };
  return map[reasonCode];
}

function reasonCodeToNotificationTitle(reasonCode: StatusReasonCode): string {
  const map: Record<StatusReasonCode, string> = {
    CONNECTING: "WhatsApp conectando",
    WAITING_PAIR: "WhatsApp aguardando pareamento",
    PHONE_OFFLINE: "Celular desconectado do WhatsApp",
    PHONE_NETWORK_UNSTABLE: "Conexão do celular instável",
    PHONE_BATTERY_LOW: "Bateria baixa no celular pareado",
    TOKEN_INVALID: "Token da instância inválido",
    INSTANCE_LIMIT: "Limite de instâncias atingido",
    UPSTREAM_ERROR: "Provedor WhatsApp indisponível",
    DISCONNECTED_UNKNOWN: "Instância desconectada",
  };
  return map[reasonCode];
}

async function createProactiveConnectionWarning(params: {
  restaurantId: string;
  reasonCode: StatusReasonCode | null;
  reasonText: string | null;
}) {
  const { restaurantId, reasonCode, reasonText } = params;
  if (!reasonCode || !PROACTIVE_REASON_CODES.has(reasonCode)) return;

  const title = reasonCodeToNotificationTitle(reasonCode);
  const canonicalReasonText = reasonCodeToText(reasonCode, null);
  const message = canonicalReasonText || reasonText || "Detectamos um problema de conexão no WhatsApp da loja.";
  const dedupeWindowStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("type", "warning")
    .eq("title", title)
    .eq("message", message)
    .eq("is_read", false)
    .gte("created_at", dedupeWindowStart)
    .limit(1);

  if (existingError) {
    console.warn("[whatsapp/status] proactive warning check failed", existingError.message);
    return;
  }

  if (existing && existing.length > 0) return;

  const { error: insertError } = await supabaseAdmin.from("notifications").insert({
    restaurant_id: restaurantId,
    title,
    message,
    type: "warning",
    is_read: false,
  });

  if (insertError) {
    console.warn("[whatsapp/status] proactive warning insert failed", insertError.message);
  }
}

export async function GET() {
  const baseUrl = UAZAPI_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json({ ok: false, error: "UAZAPI_NOT_CONFIGURED" }, { status: 501 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }

  const restaurantId = profile?.restaurant_id;
  if (!restaurantId) {
    return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 });
  }

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id, uaz_instance_token, uaz_status, uaz_phone")
    .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    return NextResponse.json(
      { ok: false, error: restaurantError?.message || "restaurant_not_found" },
      { status: 500 }
    );
  }

  if (!restaurant.uaz_instance_token) {
    return NextResponse.json({ ok: false, error: "INSTANCE_TOKEN_MISSING" }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `${baseUrl}/instance/status?token=${encodeURIComponent(restaurant.uaz_instance_token)}`,
      {
        method: "GET",
        headers: {
          apikey: UAZAPI_GLOBAL_API_KEY || "",
          token: restaurant.uaz_instance_token,
        },
        cache: "no-store",
      }
    );

    const raw = await upstream.text();
    const data = parseJsonSafe(raw);
    const upstreamHealthy = upstream.ok;

    if (!upstreamHealthy) {
      console.warn("[whatsapp/status] Uazapi HTTP request failed. Using last known database state.", {
        upstreamStatus: upstream.status,
        data,
      });
    }

    const normalizedStatus = upstreamHealthy
      ? extractStatusFromPayload(data, restaurant.uaz_status)
      : String(restaurant.uaz_status || "disconnected").toLowerCase();

    const payloadConnected = pickBoolean(data, [["connected"], ["instance", "connected"]]);
    const connected = payloadConnected ?? CONNECTED_STATUSES.has(normalizedStatus);

    const payloadLoggedIn = pickBoolean(data, [["loggedIn"], ["logged_in"], ["instance", "loggedIn"]]);
    const loggedIn = payloadLoggedIn ?? connected;

    const rawReason = pickString(data, [
      ["reason"],
      ["message"],
      ["error"],
      ["lastError"],
      ["instance", "reason"],
      ["instance", "lastError"],
      ["instance", "lastDisconnectReason"],
      ["data", "reason"],
      ["data", "message"],
    ]);

    const batteryPercent = pickNumber(data, [
      ["battery"],
      ["batteryLevel"],
      ["instance", "battery"],
      ["instance", "batteryLevel"],
      ["phone", "battery"],
      ["phone", "batteryLevel"],
    ]);

    const phoneOnline = pickBoolean(data, [
      ["phoneOnline"],
      ["instance", "phoneOnline"],
      ["phone", "online"],
      ["mobileOnline"],
      ["instance", "mobileOnline"],
    ]);

    const reasonCode = deriveReasonCode({
      upstreamHealthy,
      upstreamStatusCode: upstream.status,
      normalizedStatus,
      connected,
      loggedIn,
      rawReason,
    });
    const reason = reasonCodeToText(reasonCode, rawReason);
    const hints = reasonCodeToHints(reasonCode);

    await createProactiveConnectionWarning({
      restaurantId: String(restaurant.id),
      reasonCode,
      reasonText: reason,
    });

    if (upstreamHealthy) {
      await supabaseAdmin.from("restaurants").update({ uaz_status: normalizedStatus }).eq("id", restaurant.id);
    }

    return NextResponse.json(
      {
        ok: true,
        status: normalizedStatus,
        connected,
        loggedIn,
        statusReasonCode: reasonCode,
        statusReason: reason,
        hints,
        batteryPercent,
        phoneOnline,
        upstreamHealthy,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "UAZAPI_STATUS_FAILED" }, { status: 502 });
  }
}
