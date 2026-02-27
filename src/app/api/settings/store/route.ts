import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const { data: profile } = await supabase
        .from("profiles")
        .select("restaurant_id")
        .eq("id", user.id)
        .maybeSingle();

    if (!profile?.restaurant_id) {
        return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 });
    }

    const { data, error } = await supabase
        .from("restaurants")
        .select("store_address, delivery_price_per_km, free_delivery_threshold, pix_key")
        .eq("id", profile.restaurant_id)
        .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Mask PIX key for display (show only last 4 chars)
    const maskedPix = data.pix_key
        ? "••••" + data.pix_key.slice(-4)
        : null;

    return NextResponse.json({
        ok: true,
        settings: {
            store_address: data.store_address || "",
            delivery_price_per_km: data.delivery_price_per_km || 0,
            free_delivery_threshold: data.free_delivery_threshold || 0,
            pix_key_masked: maskedPix,
            has_pix_key: !!data.pix_key,
        },
    });
}

export async function POST(req: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const { data: profile } = await supabase
        .from("profiles")
        .select("restaurant_id")
        .eq("id", user.id)
        .maybeSingle();

    if (!profile?.restaurant_id) {
        return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 });
    }

    const body = await req.json();
    const { store_address, delivery_price_per_km, free_delivery_threshold, pix_key } = body;

    // Build update object (only include fields that were sent)
    const updatePayload: Record<string, unknown> = {};

    if (typeof store_address === "string") updatePayload.store_address = store_address.trim();
    if (typeof delivery_price_per_km === "number") updatePayload.delivery_price_per_km = delivery_price_per_km;
    if (typeof free_delivery_threshold === "number") updatePayload.free_delivery_threshold = free_delivery_threshold;
    if (typeof pix_key === "string") updatePayload.pix_key = pix_key.trim();

    if (Object.keys(updatePayload).length === 0) {
        return NextResponse.json({ ok: false, error: "NO_FIELDS_TO_UPDATE" }, { status: 400 });
    }

    const { error } = await supabase
        .from("restaurants")
        .update(updatePayload)
        .eq("id", profile.restaurant_id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, message: "Configurações salvas com sucesso." });
}
