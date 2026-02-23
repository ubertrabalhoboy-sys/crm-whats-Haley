
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ConnectBody = {
  phone?: string;
};

type ConnectResult = {
  ok: true;
  mode: "qr" | "pairing";
  qrcode?: string;
  paircode?: string;
  status?: string;
};
export async function POST(req: Request) {
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
    .select("id, uaz_instance_token")
	 .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    return NextResponse.json(
      { ok: false, error: restaurantError?.message || "restaurant_not_found" },
      { status: 500 }
    );
  }

  const { data: freshRestaurant, error: freshRestaurantError } = await supabase
    .from("restaurants")
    .select("uaz_instance_token")
    .eq("id", restaurantId)
    .single();

  if (freshRestaurantError || !freshRestaurant) {
    return NextResponse.json(
      { ok: false, error: freshRestaurantError?.message || "restaurant_not_found" },
      { status: 500 }
    );
  }

  const instanceToken = freshRestaurant.uaz_instance_token;
  if (!instanceToken) {
    return NextResponse.json({ ok: false, error: "INSTANCE_NOT_READY" }, { status: 409 });
	}

  let body: ConnectBody = {};

  try {
    body = (await req.json()) as ConnectBody;
  } catch {
    body = {};
  }

  const mode: "qr" | "pairing" = body.phone ? "pairing" : "qr";

  try {
    const upstream = await fetch(
      `${baseUrl}/instance/connect?token=${encodeURIComponent(instanceToken)}`,
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body.phone ? { phone: body.phone } : {}),
      cache: "no-store",
      }
    );

    const raw = await upstream.text();
    const data = raw ? JSON.parse(raw) : {};

    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, error: data?.error || "UAZAPI_CONNECT_FAILED" },
        { status: upstream.status || 502 }
      );
    }

    const qrcodeRaw =
      data?.qrcode ??
      data?.instance?.qrcode ??
      data?.instance?.qrcode?.base64 ??
      null;
    const paircodeRaw = data?.paircode ?? data?.instance?.paircode ?? null;
    const statusRaw = data?.instance?.status ?? data?.status ?? "connecting";

    const qrcode =
      typeof qrcodeRaw === "string"
        ? qrcodeRaw
        : typeof qrcodeRaw?.base64 === "string"
          ? qrcodeRaw.base64
          : null;
    const paircode =
      typeof paircodeRaw === "string"
        ? paircodeRaw
        : paircodeRaw != null
          ? String(paircodeRaw)
          : null;
    const statusStr =
      typeof statusRaw === "string" && statusRaw.trim() ? statusRaw : "connecting";

    if (!qrcode && !paircode) {
      return NextResponse.json({ ok: false, error: "UAZAPI_NO_QR_OR_PAIRCODE" }, { status: 502 });
    }

    const response: ConnectResult = { ok: true, mode };
    if (qrcode) response.qrcode = qrcode;
    if (paircode) response.paircode = paircode;
    if (statusStr) response.status = statusStr;
	 await supabase
      .from("restaurants")
      .update({
        uaz_status: statusStr ?? "connecting",
		  uaz_phone: body.phone ?? null,
      })
      .eq("id", restaurant.id);

    return NextResponse.json(response, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: "UAZAPI_CONNECT_FAILED" }, { status: 502 });
  }
}