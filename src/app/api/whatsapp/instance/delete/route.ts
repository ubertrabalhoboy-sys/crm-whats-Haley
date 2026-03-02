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

function normalizeDeleteError(value: unknown) {
  if (typeof value !== "string") return null;
  return value.trim().toLowerCase();
}

export async function POST() {
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
    .select("id, uaz_instance_token, uaz_expires_at")
    .eq("id", restaurantId)
    .single();

  if (restaurantSelect.error?.message?.includes("uaz_expires_at")) {
    hasExpiresColumn = false;
    restaurantSelect = await supabase
      .from("restaurants")
      .select("id, uaz_instance_token")
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

  const instanceToken = restaurant.uaz_instance_token;
  if (instanceToken) {
    const upstream = await fetch(
      `${baseUrl}/instance?token=${encodeURIComponent(instanceToken)}`,
      {
        method: "DELETE",
        headers: {
          admintoken: adminToken,
          apikey: process.env.UAZAPI_GLOBAL_API_KEY || "",
          token: instanceToken,
        },
        cache: "no-store",
      }
    );

    const upstreamRaw = await upstream.text();
    const upstreamData = parseJsonSafe(upstreamRaw);
    const errorText = normalizeDeleteError(upstreamData?.error);
    const alreadyMissing =
      upstream.status === 404 ||
      Boolean(errorText && (errorText.includes("not found") || errorText.includes("nao encontrada")));

    if (!upstream.ok && !alreadyMissing) {
      return NextResponse.json(
        { ok: false, error: upstreamData?.error || "UAZAPI_INSTANCE_DELETE_FAILED" },
        { status: upstream.status || 502 }
      );
    }
  }

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
    .eq("id", restaurantId);

  if (resetError) {
    return NextResponse.json({ ok: false, error: resetError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
