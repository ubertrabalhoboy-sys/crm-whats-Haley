import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PUBLIC_BASE_URL,
  UAZAPI_ADMIN_TOKEN,
  UAZAPI_BASE_URL,
  UAZAPI_GLOBAL_API_KEY,
  WEBHOOK_SECRET_TOKEN,
} from "@/lib/shared/env";

export const runtime = "nodejs";

function parseJsonSafe(text: string) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, "");
}

async function configureWebhookAfterEnsure(params: {
  baseUrl: string;
  instanceToken: string;
}) {
  const publicBaseUrl = PUBLIC_BASE_URL;
  if (!publicBaseUrl) {
    return {
      ok: false as const,
      error: "PUBLIC_BASE_URL_NOT_CONFIGURED",
    };
  }

  const secretParam = WEBHOOK_SECRET_TOKEN
    ? `&secret=${encodeURIComponent(WEBHOOK_SECRET_TOKEN)}`
    : "";
  const webhookUrl =
    `${normalizeBaseUrl(publicBaseUrl)}` +
    `/api/webhook/uazapi?token=${encodeURIComponent(params.instanceToken)}${secretParam}`;

  const payload = {
    enabled: true,
    url: webhookUrl,
    events: ["messages", "connection", "messages_update"],
    excludeMessages: ["wasSentByApi", "isGroupYes"],
    addUrlEvents: false,
    addUrlTypesMessages: false,
  };

  const upstream = await fetch(
    `${normalizeBaseUrl(params.baseUrl)}/webhook?token=${encodeURIComponent(params.instanceToken)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: UAZAPI_GLOBAL_API_KEY || "",
        token: params.instanceToken,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  const raw = await upstream.text();
  const data = parseJsonSafe(raw);

  if (!upstream.ok || upstream.status !== 200) {
    return {
      ok: false as const,
      error: (typeof data?.error === "string" && data.error) || "UAZAPI_WEBHOOK_CONFIG_FAILED",
    };
  }

  return { ok: true as const };
}

function normalizeDeleteError(value: unknown) {
  if (typeof value !== "string") return null;
  return value.trim().toLowerCase();
}

function shouldIgnoreDeleteFailure(status: number, errorText: string | null) {
  if (status === 404) {
    return true;
  }

  if (!errorText) {
    return false;
  }

  return (
    errorText.includes("not found") ||
    errorText.includes("nao encontrada") ||
    errorText.includes("invalid token") ||
    errorText.includes("token invalido") ||
    errorText.includes("instance expired") ||
    errorText.includes("instancia expirada")
  );
}

function isMaxInstancesError(errorText: unknown) {
  if (typeof errorText !== "string") {
    return false;
  }

  const normalized = errorText.trim().toLowerCase();
  return (
    normalized.includes("maximum number of instances reached") ||
    normalized.includes("max instances") ||
    normalized.includes("limite de instancias")
  );
}

type DeleteRemoteInstanceParams = {
  baseUrl: string;
  adminToken: string;
  globalApiKey: string;
  instanceId?: string | null;
  instanceName?: string | null;
  instanceToken?: string | null;
};

async function deleteRemoteInstance(params: DeleteRemoteInstanceParams) {
  const attempts: Array<{ value: string; source: "instance_id" | "instance_name" | "instance_token" }> = [];

  if (typeof params.instanceId === "string" && params.instanceId.trim()) {
    attempts.push({ value: params.instanceId.trim(), source: "instance_id" });
  }

  if (typeof params.instanceName === "string" && params.instanceName.trim()) {
    attempts.push({ value: params.instanceName.trim(), source: "instance_name" });
  }

  if (typeof params.instanceToken === "string" && params.instanceToken.trim()) {
    attempts.push({ value: params.instanceToken.trim(), source: "instance_token" });
  }

  let lastFailure: { status: number; error: unknown } | null = null;

  for (const attempt of attempts) {
    const url =
      attempt.source === "instance_token"
        ? `${params.baseUrl}/instance?token=${encodeURIComponent(attempt.value)}`
        : `${params.baseUrl}/instance/delete/${encodeURIComponent(attempt.value)}`;

    const headers: Record<string, string> = {
      admintoken: params.adminToken,
      apikey: params.globalApiKey,
    };

    if (attempt.source === "instance_token") {
      headers.token = attempt.value;
    }

    const upstream = await fetch(url, {
      method: "DELETE",
      headers,
      cache: "no-store",
    });

    const upstreamRaw = await upstream.text();
    const upstreamData = parseJsonSafe(upstreamRaw);
    const errorText = normalizeDeleteError(upstreamData?.error);
    const ignorableDeleteFailure = shouldIgnoreDeleteFailure(upstream.status, errorText);

    if (upstream.ok || ignorableDeleteFailure) {
      return { ok: true as const, source: attempt.source, ignored: !upstream.ok };
    }

    lastFailure = {
      status: upstream.status || 502,
      error: upstreamData?.error || "UAZAPI_INSTANCE_DELETE_FAILED",
    };
  }

  if (!attempts.length) {
    return { ok: true as const, source: null, ignored: true };
  }

  return {
    ok: false as const,
    status: lastFailure?.status || 502,
    error: lastFailure?.error || "UAZAPI_INSTANCE_DELETE_FAILED",
  };
}

export async function POST(req: Request) {
  const reqUrl = new URL(req.url);
  const forceParam = (reqUrl.searchParams.get("force") || "").toLowerCase();
  const forceRecreate = forceParam === "1" || forceParam === "true";

  const baseUrl = UAZAPI_BASE_URL;
  const adminToken = UAZAPI_ADMIN_TOKEN;

  if (!baseUrl || !adminToken) {
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

  let hasExpiresColumn = true;
  let restaurantSelect = await supabase
    .from("restaurants")
    .select(
      "id, uaz_instance_id, uaz_instance_name, uaz_instance_token, uaz_status, uaz_phone, uaz_expires_at"
    )
    .eq("id", restaurantId)
    .single();

  if (restaurantSelect.error?.message?.includes("uaz_expires_at")) {
    hasExpiresColumn = false;
    restaurantSelect = await supabase
      .from("restaurants")
      .select("id, uaz_instance_id, uaz_instance_name, uaz_instance_token, uaz_status, uaz_phone")
      .eq("id", restaurantId)
      .single();
  }

  const { data: restaurant, error: restaurantError } = restaurantSelect;

  if (restaurantError || !restaurant) {
    return NextResponse.json(
      { ok: false, error: restaurantError?.message || "restaurant_not_found" },
      { status: 500 }
    );
  }

  if (!forceRecreate && restaurant.uaz_instance_token) {
    return NextResponse.json(
      {
        ok: true,
        status: restaurant.uaz_status ?? null,
        phone: restaurant.uaz_phone ?? null,
      },
      { status: 200 }
    );
  }

  if (forceRecreate) {
    const deleteResult = await deleteRemoteInstance({
      baseUrl,
      adminToken,
      globalApiKey: UAZAPI_GLOBAL_API_KEY || "",
      instanceId: restaurant.uaz_instance_id,
      instanceName: restaurant.uaz_instance_name,
      instanceToken: restaurant.uaz_instance_token,
    });

    if (!deleteResult.ok) {
      console.warn("[whatsapp/instance/ensure] Non-blocking instance delete failure", {
        restaurantId,
        error: deleteResult.error,
        upstreamStatus: deleteResult.status,
      });
    }
  }

  const payload = {
    name: `r-${restaurantId}-${Date.now()}`,
    systemName: "my-saas",
    adminField01: restaurantId,
    adminField02: user.id,
    fingerprintProfile: "chrome",
    browser: "chrome",
  };

  const upstream = await fetch(`${baseUrl}/instance/init`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      admintoken: adminToken,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const upstreamRaw = await upstream.text();
  const upstreamData = parseJsonSafe(upstreamRaw);

  if (!upstream.ok) {
    console.warn("[whatsapp/instance/ensure] Uazapi instance init failed", {
      restaurantId,
      forceRecreate,
      upstreamStatus: upstream.status,
      error: upstreamData?.error || null,
    });

    if (forceRecreate && restaurant.uaz_instance_token && isMaxInstancesError(upstreamData?.error)) {
      return NextResponse.json(
        {
          ok: true,
          status: restaurant.uaz_status ?? null,
          phone: restaurant.uaz_phone ?? null,
          reusedExistingInstance: true,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { ok: false, error: upstreamData?.error || "UAZAPI_INSTANCE_INIT_FAILED" },
      { status: upstream.status || 502 }
    );
  }

  const instanceId =
    upstreamData?.instance?.id ??
    upstreamData?.instance_id ??
    upstreamData?.instanceId ??
    null;
  const instanceToken =
    upstreamData?.instance?.token ??
    upstreamData?.instance_token ??
    upstreamData?.instanceToken ??
    null;
  const instanceName =
    upstreamData?.instance?.name ??
    upstreamData?.instance_name ??
    upstreamData?.instanceName ??
    null;
	const status = upstreamData?.instance?.status ?? upstreamData?.status ?? "disconnected";

  if (!instanceId || !instanceToken) {
    return NextResponse.json({ ok: false, error: "UAZAPI_INVALID_RESPONSE" }, { status: 502 });
  }

  const updatePayload: Record<string, unknown> = {
    uaz_instance_id: instanceId,
    uaz_instance_token: instanceToken,
    uaz_status: status,
    uaz_phone: null,
  };
  updatePayload.uaz_instance_name = instanceName || payload.name;
  if (hasExpiresColumn) {
    updatePayload.uaz_expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }

  const { error: updateError } = await supabase
    .from("restaurants")
    .update(updatePayload)
    .eq("id", restaurant.id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  try {
    const webhookSync = await configureWebhookAfterEnsure({
      baseUrl,
      instanceToken: String(instanceToken),
    });
    if (!webhookSync.ok) {
      console.warn("[whatsapp/instance/ensure] webhook auto-config failed", {
        restaurantId,
        error: webhookSync.error,
      });
    }
  } catch (error) {
    console.warn("[whatsapp/instance/ensure] webhook auto-config threw", {
      restaurantId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({ ok: true, status, phone: null }, { status: 200 });
}
