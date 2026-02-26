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

    const { data: stages, error } = await supabase
        .from("kanban_stages")
        .select("id, name")
        .eq("restaurant_id", profile.restaurant_id)
        .order("position", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, stages: stages || [] });
}
