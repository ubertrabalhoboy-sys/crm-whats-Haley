import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseJsonSafe(text: string) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
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
          "Authorization": `Bearer ${process.env.UAZAPI_GLOBAL_API_KEY}`,
          "Instance-Token": restaurant.uaz_instance_token
        },
        cache: "no-store",
      }
    );

    const raw = await upstream.text();
    const data = parseJsonSafe(raw);

    if (!upstream.ok) {
      console.warn("[whatsapp/status] Uazapi HTTP request failed. Assumming last known database state to prevent UI deadlock.", { upstreamStatus: upstream.status, data });
      const fallbackStatus = restaurant.uaz_status || "disconnected";
      return NextResponse.json(
        {
          ok: true,
          status: fallbackStatus,
          connected: ["open", "connected"].includes(fallbackStatus),
          loggedIn: ["open", "connected"].includes(fallbackStatus)
        },
        { status: 200 }
      );
    }

    let status = data?.status ?? data?.data?.status ?? restaurant.uaz_status ?? "disconnected";

    // Normalize if it's a state object from some Uazapi responses
    if (typeof status === "object" && status !== null) {
      status = (status as any).state || (status as any).status || "unknown";
    }

    const normalizedStatus = String(status).toLowerCase();

    const connected =
      typeof data?.connected === "boolean"
        ? data.connected
        : ["connected", "open", "ready", "online"].includes(normalizedStatus);

    const loggedIn =
      typeof data?.loggedIn === "boolean"
        ? data.loggedIn
        : typeof data?.logged_in === "boolean"
          ? data.logged_in
          : connected;

    // Sync back to DB for other parts of the system (like dashboard) using Admin Client to bypass RLS
    await supabaseAdmin.from("restaurants").update({ uaz_status: normalizedStatus }).eq("id", restaurant.id);

    return NextResponse.json(
      {
        ok: true,
        status: normalizedStatus,
        connected,
        loggedIn,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "UAZAPI_STATUS_FAILED" }, { status: 502 });
  }
}