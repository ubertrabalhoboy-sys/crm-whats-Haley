import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    const supabase = await createSupabaseServerClient();
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

    const restaurantId = profile?.restaurant_id ?? null;
    if (!restaurantId) {
        return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 });
    }

    const { data, error } = await supabase
        .from("chats")
        .select("unread_count")
        .eq("restaurant_id", restaurantId)
        .gt("unread_count", 0)
        .limit(5000);

    if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const totalUnread = (data || []).reduce((sum, row) => {
        const value = Number(row.unread_count);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    return NextResponse.json({ ok: true, totalUnread }, { status: 200 });
}
