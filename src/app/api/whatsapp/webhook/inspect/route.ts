import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, "");
}

function parseJsonSafe(text: string) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function sanitizeWebhookPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeWebhookPayload(item));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const keyLower = key.toLowerCase();
      const isSensitive =
        keyLower === "token" ||
        keyLower === "instancetoken" ||
        keyLower === "admintoken" ||
        keyLower === "authorization" ||
        keyLower === "password" ||
        keyLower === "secret" ||
        keyLower === "apikey" ||
        keyLower === "api_key";

      if (isSensitive) continue;
      output[key] = sanitizeWebhookPayload(raw);
    }
    return output;
  }

  return value;
}

export async function GET() {
  const baseUrl = process.env.UAZAPI_BASE_URL;
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
    .select("uaz_instance_token")
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

  const upstream = await fetch(
    `${normalizeBaseUrl(baseUrl)}/webhook?token=${encodeURIComponent(restaurant.uaz_instance_token)}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const raw = await upstream.text();
  const data = parseJsonSafe(raw);

  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: data?.error || "UAZAPI_WEBHOOK_INSPECT_FAILED" },
      { status: upstream.status || 502 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      webhook: sanitizeWebhookPayload(data),
    },
    { status: 200 }
  );
}
