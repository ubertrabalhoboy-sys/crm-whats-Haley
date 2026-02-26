import { NextResponse } from "next/server";
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

    const rid = profile.restaurant_id;

    // Total spins (all chats originated from Roleta)
    const { count: totalSpins } = await supabase
        .from("chats")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", rid)
        .eq("origem_lead", "Roleta");

    // Spins in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: weekSpins } = await supabase
        .from("chats")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", rid)
        .eq("origem_lead", "Roleta")
        .gte("created_at", sevenDaysAgo);

    // Spins today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todaySpins } = await supabase
        .from("chats")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", rid)
        .eq("origem_lead", "Roleta")
        .gte("created_at", todayStart.toISOString());

    // Prizes breakdown (group by cupom_ganho)
    const { data: allSpins } = await supabase
        .from("chats")
        .select("cupom_ganho")
        .eq("restaurant_id", rid)
        .eq("origem_lead", "Roleta");

    const prizeBreakdown: Record<string, number> = {};
    if (allSpins) {
        for (const spin of allSpins) {
            const prize = spin.cupom_ganho || "Desconhecido";
            prizeBreakdown[prize] = (prizeBreakdown[prize] || 0) + 1;
        }
    }

    return NextResponse.json({
        ok: true,
        stats: {
            totalSpins: totalSpins || 0,
            weekSpins: weekSpins || 0,
            todaySpins: todaySpins || 0,
            prizeBreakdown,
        },
    });
}
