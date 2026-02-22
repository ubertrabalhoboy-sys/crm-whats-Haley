import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function parseJsonSafe(text: string) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const reqUrl = new URL(req.url);
  const forceParam = (reqUrl.searchParams.get("force") || "").toLowerCase();
  const forceRecreate = forceParam === "1" || forceParam === "true";

  const baseUrl = process.env.UAZAPI_BASE_URL;
  const adminToken = process.env.UAZAPI_ADMIN_TOKEN;

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
    .select("id, uaz_instance_id, uaz_instance_token, uaz_status, uaz_phone, uaz_expires_at")
    .eq("id", restaurantId)
    .single();

  if (restaurantSelect.error?.message?.includes("uaz_expires_at")) {
    hasExpiresColumn = false;
    restaurantSelect = await supabase
      .from("restaurants")
      .select("id, uaz_instance_id, uaz_instance_token, uaz_status, uaz_phone")
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
    const resetPayload: Record<string, unknown> = {
      uaz_instance_id: null,
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
      .eq("id", restaurant.id);

    if (resetError) {
      return NextResponse.json({ ok: false, error: resetError.message }, { status: 500 });
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
  if (instanceName) {
    updatePayload.uaz_instance_name = instanceName;
  }
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

  return NextResponse.json({ ok: true, status, phone: null }, { status: 200 });
}
