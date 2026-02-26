import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ restaurantId: string }> }
) {
    const { restaurantId } = await params;

    const { data: prizes, error } = await supabaseServer
        .from("roulette_prizes")
        .select("id, label, trigger_tag, chance_percentage, color")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: true });

    if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!prizes || prizes.length === 0) {
        return NextResponse.json({ ok: false, error: "Nenhum prêmio configurado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, prizes });
}
