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

async function getRestaurantContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      errorResponse: NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      errorResponse: NextResponse.json({ ok: false, error: profileError.message }, { status: 500 }),
    };
  }

  const restaurantId = profile?.restaurant_id;
  if (!restaurantId) {
    return {
      errorResponse: NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 }),
    };
  }

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id, uaz_instance_token")
    .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    return {
      errorResponse: NextResponse.json(
        { ok: false, error: restaurantError?.message || "restaurant_not_found" },
        { status: 500 }
      ),
    };
  }

  if (!restaurant.uaz_instance_token) {
    return {
      errorResponse: NextResponse.json({ ok: false, error: "INSTANCE_TOKEN_MISSING" }, { status: 400 }),
    };
  }

  return {
    instanceToken: restaurant.uaz_instance_token,
  };
}

export async function POST(req: Request) {
  const baseUrl = process.env.UAZAPI_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json({ ok: false, error: "UAZAPI_NOT_CONFIGURED" }, { status: 501 });
  }
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  if (!publicBaseUrl) {
    return NextResponse.json({ ok: false, error: "PUBLIC_BASE_URL_NOT_CONFIGURED" }, { status: 501 });
  }

  const context = await getRestaurantContext();
  if ("errorResponse" in context) return context.errorResponse;

  const webhookUrl = `${normalizeBaseUrl(publicBaseUrl)}/api/webhook/uazapi?token=${encodeURIComponent(context.instanceToken)}`;
  const payload = {
    enabled: true,
    url: webhookUrl,
    events: ["messages", "connection", "messages_update"],
    excludeMessages: ["wasSentByApi", "isGroupYes"],
    addUrlEvents: false,
    addUrlTypesMessages: false,
  };

  const upstream = await fetch(
    `${normalizeBaseUrl(baseUrl)}/webhook?token=${encodeURIComponent(context.instanceToken)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.UAZAPI_GLOBAL_API_KEY || "",
        token: context.instanceToken,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  const raw = await upstream.text();
  const data = parseJsonSafe(raw);

  if (!upstream.ok || upstream.status !== 200) {
    return NextResponse.json(
      { ok: false, error: data?.error || "UAZAPI_WEBHOOK_CONFIG_FAILED" },
      { status: upstream.status || 502 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function GET() {
  const baseUrl = process.env.UAZAPI_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json({ ok: false, error: "UAZAPI_NOT_CONFIGURED" }, { status: 501 });
  }

  const context = await getRestaurantContext();
  if ("errorResponse" in context) return context.errorResponse;

  const upstream = await fetch(
    `${normalizeBaseUrl(baseUrl)}/webhook?token=${encodeURIComponent(context.instanceToken)}`,
    {
      method: "GET",
      headers: {
        "apikey": process.env.UAZAPI_GLOBAL_API_KEY || "",
        "token": context.instanceToken,
      },
      cache: "no-store",
    }
  );

  const raw = await upstream.text();
  const data = parseJsonSafe(raw);

  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: data?.error || "UAZAPI_WEBHOOK_STATUS_FAILED" },
      { status: upstream.status || 502 }
    );
  }

  const url =
    (typeof data?.url === "string" ? data.url : null) ??
    (typeof data?.webhook?.url === "string" ? data.webhook.url : null);
  const events = Array.isArray(data?.events)
    ? data.events
    : Array.isArray(data?.webhook?.events)
      ? data.webhook.events
      : [];

  return NextResponse.json(
    {
      ok: true,
      configured: Boolean(url || events.length),
      url,
      events,
    },
    { status: 200 }
  );
}
