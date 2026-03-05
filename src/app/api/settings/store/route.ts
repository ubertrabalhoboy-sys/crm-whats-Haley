import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/shared/env";

export const dynamic = "force-dynamic";

type RestaurantVertical = "burger" | "acai" | "pizza" | "sushi" | "generic";

function normalizeVertical(value: unknown): RestaurantVertical | null {
    const normalized = String(value || "").trim().toLowerCase();
    if (
        normalized === "burger" ||
        normalized === "acai" ||
        normalized === "pizza" ||
        normalized === "sushi" ||
        normalized === "generic"
    ) {
        return normalized;
    }
    return null;
}

export async function GET() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

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
        .select("name, store_address, delivery_price_per_km, free_delivery_threshold, pix_key, operating_hours")
        .eq("id", profile.restaurant_id)
        .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    let aiVertical: RestaurantVertical | null = null;
    const { data: playbookOverride } = await supabase
        .from("restaurant_ai_playbook_overrides")
        .select("fixed_vertical")
        .eq("restaurant_id", profile.restaurant_id)
        .maybeSingle();

    if (playbookOverride?.fixed_vertical) {
        aiVertical = normalizeVertical(playbookOverride.fixed_vertical);
    }

    const maskedPix = data.pix_key ? "****" + data.pix_key.slice(-4) : null;

    return NextResponse.json({
        ok: true,
        settings: {
            store_name: data.name || "",
            store_address: data.store_address || "",
            delivery_price_per_km: data.delivery_price_per_km || 0,
            free_delivery_threshold: data.free_delivery_threshold || 0,
            pix_key_masked: maskedPix,
            has_pix_key: !!data.pix_key,
            operating_hours: data.operating_hours || {},
            ai_vertical: aiVertical,
        },
    });
}

export async function POST(req: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

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
    const {
        store_name,
        store_address,
        delivery_price_per_km,
        free_delivery_threshold,
        pix_key,
        password,
        operating_hours,
        ai_vertical,
    } = body;

    if (typeof pix_key === "string" && pix_key.trim() !== "") {
        if (!password) {
            return NextResponse.json({ ok: false, error: "PASSWORD_REQUIRED_FOR_PIX" }, { status: 403 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const authClient = createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            { auth: { persistSession: false } }
        );

        const { error: authError } = await authClient.auth.signInWithPassword({
            email: user.email!,
            password: password,
        });

        if (authError) {
            return NextResponse.json({ ok: false, error: "INVALID_PASSWORD" }, { status: 403 });
        }
    }

    const updatePayload: Record<string, unknown> = {};

    if (typeof store_name === "string") updatePayload.name = store_name.trim();
    if (typeof store_address === "string") updatePayload.store_address = store_address.trim();
    if (typeof delivery_price_per_km === "number") updatePayload.delivery_price_per_km = delivery_price_per_km;
    if (typeof free_delivery_threshold === "number") updatePayload.free_delivery_threshold = free_delivery_threshold;
    if (typeof pix_key === "string") updatePayload.pix_key = pix_key.trim();
    if (operating_hours) updatePayload.operating_hours = operating_hours;

    const hasAiVerticalUpdate = typeof ai_vertical === "string";
    const normalizedVertical = hasAiVerticalUpdate ? normalizeVertical(ai_vertical) : null;

    if (hasAiVerticalUpdate && !normalizedVertical) {
        return NextResponse.json({ ok: false, error: "INVALID_AI_VERTICAL" }, { status: 400 });
    }

    if (Object.keys(updatePayload).length === 0 && !hasAiVerticalUpdate) {
        return NextResponse.json({ ok: false, error: "NO_FIELDS_TO_UPDATE" }, { status: 400 });
    }

    if (Object.keys(updatePayload).length > 0) {
        const { error } = await supabase
            .from("restaurants")
            .update(updatePayload)
            .eq("id", profile.restaurant_id);

        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (normalizedVertical) {
        const allowBebida = normalizedVertical === "acai" ? false : true;
        const { error: overrideError } = await supabase
            .from("restaurant_ai_playbook_overrides")
            .upsert(
                {
                    restaurant_id: profile.restaurant_id,
                    fixed_vertical: normalizedVertical,
                    allow_principal: true,
                    allow_adicional: true,
                    allow_bebida: allowBebida,
                },
                { onConflict: "restaurant_id" }
            );

        if (overrideError) {
            const errorCode = String(overrideError.code || "");
            const errorMessage = String(overrideError.message || "").toLowerCase();
            const overrideTableMissing =
                errorCode === "42P01" ||
                (errorMessage.includes("restaurant_ai_playbook_overrides") &&
                    errorMessage.includes("does not exist"));

            if (overrideTableMissing) {
                return NextResponse.json({
                    ok: true,
                    message: "Configuracoes salvas com sucesso.",
                    ai_vertical: null,
                    playbook_override: {
                        created: false,
                        reason: "TABLE_NOT_MIGRATED",
                    },
                });
            }

            return NextResponse.json({ ok: false, error: overrideError.message }, { status: 500 });
        }
    }

    return NextResponse.json({
        ok: true,
        message: "Configuracoes salvas com sucesso.",
        ai_vertical: normalizedVertical || null,
    });
}
