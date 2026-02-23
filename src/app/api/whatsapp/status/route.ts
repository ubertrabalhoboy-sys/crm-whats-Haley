import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

function parseJsonSafe(text: string) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function createRouteSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // no-op in route contexts where cookies are read-only
          }
        },
      },
    }
  );
}

export async function GET() {
  const baseUrl = process.env.UAZAPI_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json({ ok: false, error: "UAZAPI_NOT_CONFIGURED" }, { status: 501 });
  }

  const supabase = await createRouteSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
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
        cache: "no-store",
      }
    );

    const raw = await upstream.text();
    const data = parseJsonSafe(raw);

    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, error: data?.error || "UAZAPI_STATUS_FAILED" },
        { status: upstream.status || 502 }
      );
    }

    const status = data?.status ?? data?.data?.status ?? restaurant.uaz_status ?? "disconnected";
    const qrcodeRaw =
      data?.qrcode ??
      data?.instance?.qrcode ??
      data?.data?.qrcode ??
      data?.instance?.qrcode?.base64 ??
      null;
    const paircodeRaw =
      data?.paircode ?? data?.instance?.paircode ?? data?.data?.paircode ?? null;
    const jid =
      data?.jid ??
      data?.instance?.jid ??
      data?.data?.jid ??
      data?.instance?.owner ??
      data?.owner ??
      null;
    const connected =
      typeof data?.connected === "boolean"
        ? data.connected
        : ["connected", "open", "ready", "online"].includes(String(status).toLowerCase());
    const loggedIn =
      typeof data?.loggedIn === "boolean"
        ? data.loggedIn
        : typeof data?.logged_in === "boolean"
          ? data.logged_in
          : connected;

    await supabase.from("restaurants").update({ uaz_status: status }).eq("id", restaurant.id);

    const qrcode =
      typeof qrcodeRaw === "string"
        ? qrcodeRaw
        : typeof qrcodeRaw?.base64 === "string"
          ? qrcodeRaw.base64
          : undefined;
    const paircode =
      typeof paircodeRaw === "string"
        ? paircodeRaw
        : paircodeRaw != null
          ? String(paircodeRaw)
          : undefined;

    return NextResponse.json(
      {
        ok: true,
        status,
        connected,
        loggedIn,
        ...(qrcode ? { qrcode } : {}),
        ...(paircode ? { paircode } : {}),
        ...(jid ? { jid: String(jid) } : {}),
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "UAZAPI_STATUS_FAILED" }, { status: 502 });
  }
}
