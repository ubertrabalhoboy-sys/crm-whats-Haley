import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  UAZAPI_ADMIN_TOKEN,
  UAZAPI_BASE_URL,
  UAZAPI_GLOBAL_API_KEY,
} from "@/lib/shared/env";

export const runtime = "nodejs";

function parseJsonSafe(text: string) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
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
      return { ok: true as const };
    }

    lastFailure = {
      status: upstream.status || 502,
      error: upstreamData?.error || "UAZAPI_INSTANCE_DELETE_FAILED",
    };
  }

  if (!attempts.length) {
    return { ok: true as const };
  }

  return {
    ok: false as const,
    status: lastFailure?.status || 502,
    error: lastFailure?.error || "UAZAPI_INSTANCE_DELETE_FAILED",
  };
}

export async function POST() {
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
    .select("id, uaz_instance_id, uaz_instance_name, uaz_instance_token, uaz_expires_at")
    .eq("id", restaurantId)
    .single();

  if (restaurantSelect.error?.message?.includes("uaz_expires_at")) {
    hasExpiresColumn = false;
    restaurantSelect = await supabase
      .from("restaurants")
      .select("id, uaz_instance_id, uaz_instance_name, uaz_instance_token")
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

  const deleteResult = await deleteRemoteInstance({
    baseUrl,
    adminToken,
    globalApiKey: UAZAPI_GLOBAL_API_KEY || "",
    instanceId: restaurant.uaz_instance_id,
    instanceName: restaurant.uaz_instance_name,
    instanceToken: restaurant.uaz_instance_token,
  });

  if (!deleteResult.ok) {
    return NextResponse.json(
      { ok: false, error: deleteResult.error || "UAZAPI_INSTANCE_DELETE_FAILED" },
      { status: deleteResult.status || 502 }
    );
  }

  const resetPayload: Record<string, unknown> = {
    uaz_instance_id: null,
    uaz_instance_name: null,
    uaz_instance_token: null,
    uaz_status: "disconnected",
    uaz_phone: null,
  };

  if (hasExpiresColumn) {
    resetPayload.uaz_expires_at = null;
  }

  const { error: resetError } = await supabase
    .from("restaurants")
    .update(resetPayload)
    .eq("id", restaurantId);

  if (resetError) {
    return NextResponse.json({ ok: false, error: resetError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
