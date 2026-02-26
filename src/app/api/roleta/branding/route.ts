import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET — Return current branding for the logged-in restaurant
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

    const { data: restaurant, error } = await supabase
        .from("restaurants")
        .select("name, logo_url, roulette_headline")
        .eq("id", profile.restaurant_id)
        .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({
        ok: true,
        branding: {
            name: restaurant?.name || "",
            logo_url: restaurant?.logo_url || "",
            roulette_headline: restaurant?.roulette_headline || "",
        },
    });
}

// POST — Save branding fields
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
    const { logo_url, roulette_headline } = body;

    // Basic validation
    if (logo_url && typeof logo_url !== "string") {
        return NextResponse.json({ ok: false, error: "logo_url deve ser texto." }, { status: 400 });
    }
    if (roulette_headline && typeof roulette_headline !== "string") {
        return NextResponse.json({ ok: false, error: "roulette_headline deve ser texto." }, { status: 400 });
    }

    const { error } = await supabase
        .from("restaurants")
        .update({
            logo_url: (logo_url || "").trim().slice(0, 500),
            roulette_headline: (roulette_headline || "").trim().slice(0, 100),
        })
        .eq("id", profile.restaurant_id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, message: "Branding salvo!" });
}
