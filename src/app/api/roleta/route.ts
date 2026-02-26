import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET — List prizes for the current restaurant
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

    const { data: prizes, error } = await supabase
        .from("roulette_prizes")
        .select("*")
        .eq("restaurant_id", profile.restaurant_id)
        .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, prizes: prizes || [] });
}

// POST — Save all prizes (replace strategy: delete old + insert new)
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
    const prizes: Array<{
        label: string;
        trigger_tag: string;
        chance_percentage: number;
        color: string;
    }> = body.prizes;

    if (!Array.isArray(prizes) || prizes.length === 0 || prizes.length > 8) {
        return NextResponse.json({ ok: false, error: "Entre 1 e 8 prêmios são necessários." }, { status: 400 });
    }

    // Validate: sum must equal 100
    const sum = prizes.reduce((acc, p) => acc + (Number(p.chance_percentage) || 0), 0);
    if (sum !== 100) {
        return NextResponse.json({ ok: false, error: `A soma das chances deve ser 100%. Atual: ${sum}%` }, { status: 400 });
    }

    // Validate each prize
    for (const p of prizes) {
        if (!p.label?.trim() || !p.trigger_tag?.trim()) {
            return NextResponse.json({ ok: false, error: "Todos os prêmios devem ter nome e tag preenchidos." }, { status: 400 });
        }
        if (p.chance_percentage < 0 || p.chance_percentage > 100) {
            return NextResponse.json({ ok: false, error: "Chance deve estar entre 0 e 100." }, { status: 400 });
        }
    }

    // Replace strategy: delete all existing, then insert new batch
    const { error: deleteError } = await supabase
        .from("roulette_prizes")
        .delete()
        .eq("restaurant_id", profile.restaurant_id);

    if (deleteError) {
        return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    const rows = prizes.map(p => ({
        restaurant_id: profile.restaurant_id,
        label: p.label.trim(),
        trigger_tag: p.trigger_tag.trim(),
        chance_percentage: Number(p.chance_percentage),
        color: p.color || "#FF0000",
    }));

    const { error: insertError } = await supabase
        .from("roulette_prizes")
        .insert(rows);

    if (insertError) {
        return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Prêmios salvos com sucesso!" });
}
