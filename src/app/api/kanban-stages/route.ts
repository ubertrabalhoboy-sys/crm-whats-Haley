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

export async function POST(req: Request) {
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

    const body = (await req.json().catch(() => null)) as
        | { orderedStageIds?: unknown }
        | null;
    const orderedStageIds = Array.isArray(body?.orderedStageIds)
        ? body!.orderedStageIds.filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0
        )
        : [];

    if (orderedStageIds.length === 0) {
        return NextResponse.json({ ok: false, error: "INVALID_STAGE_ORDER" }, { status: 400 });
    }

    const { data: existingStages, error: existingError } = await supabase
        .from("kanban_stages")
        .select("id")
        .eq("restaurant_id", profile.restaurant_id);

    if (existingError) {
        return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
    }

    const existingIds = new Set((existingStages || []).map((row) => row.id));
    const orderedIdsUnique = Array.from(new Set(orderedStageIds));

    if (
        orderedIdsUnique.length !== existingIds.size ||
        orderedIdsUnique.some((id) => !existingIds.has(id))
    ) {
        return NextResponse.json(
            { ok: false, error: "STAGE_ORDER_MISMATCH" },
            { status: 400 }
        );
    }

    const updates = orderedIdsUnique.map((stageId, index) =>
        supabase
            .from("kanban_stages")
            .update({ position: index + 1 })
            .eq("id", stageId)
            .eq("restaurant_id", profile.restaurant_id)
    );

    const updateResults = await Promise.all(updates);
    const failedUpdate = updateResults.find((result) => result.error);
    if (failedUpdate?.error) {
        return NextResponse.json({ ok: false, error: failedUpdate.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
}
