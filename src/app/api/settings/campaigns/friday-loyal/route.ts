import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SchedulePayload = {
    enabled?: boolean;
    weekdays?: number[];
    hour_local?: number;
    timezone?: string;
};

function normalizeWeekdays(value: unknown) {
    if (!Array.isArray(value)) return [];
    const unique = new Set<number>();
    for (const item of value) {
        const parsed = Number(item);
        if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) {
            unique.add(parsed);
        }
    }
    return Array.from(unique.values()).sort((a, b) => a - b);
}

function tableMissing(error: { code?: string | null; message?: string | null } | null) {
    const code = String(error?.code || "");
    const message = String(error?.message || "").toLowerCase();
    return code === "42P01" || (message.includes("restaurant_campaign_schedules") && message.includes("does not exist"));
}

async function resolveRestaurantId() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return {
            supabase,
            errorResponse: NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 }),
            restaurantId: null as string | null,
        };
    }

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("restaurant_id")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError) {
        return {
            supabase,
            errorResponse: NextResponse.json({ ok: false, error: profileError.message }, { status: 500 }),
            restaurantId: null as string | null,
        };
    }

    if (!profile?.restaurant_id) {
        return {
            supabase,
            errorResponse: NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 }),
            restaurantId: null as string | null,
        };
    }

    return {
        supabase,
        errorResponse: null,
        restaurantId: profile.restaurant_id as string,
    };
}

export async function GET() {
    const context = await resolveRestaurantId();
    if (context.errorResponse || !context.restaurantId) {
        return context.errorResponse as NextResponse;
    }

    const { data, error } = await context.supabase
        .from("restaurant_campaign_schedules")
        .select("enabled, weekdays, hour_local, timezone")
        .eq("restaurant_id", context.restaurantId)
        .eq("campaign_key", "friday_loyal")
        .maybeSingle();

    if (tableMissing(error)) {
        return NextResponse.json({
            ok: true,
            configured: false,
            migration_required: true,
            schedule: null,
        });
    }

    if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        configured: Boolean(data),
        migration_required: false,
        schedule: data
            ? {
                enabled: Boolean(data.enabled),
                weekdays: normalizeWeekdays(data.weekdays),
                hour_local: Number(data.hour_local ?? 20),
                timezone: typeof data.timezone === "string" && data.timezone.trim()
                    ? data.timezone.trim()
                    : "America/Sao_Paulo",
            }
            : null,
    });
}

export async function POST(req: NextRequest) {
    const context = await resolveRestaurantId();
    if (context.errorResponse || !context.restaurantId) {
        return context.errorResponse as NextResponse;
    }

    let body: SchedulePayload;
    try {
        body = (await req.json()) as SchedulePayload;
    } catch {
        return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
    }

    const enabled = body.enabled !== false;
    const weekdays = normalizeWeekdays(body.weekdays);
    const hourLocal = Number(body.hour_local);
    const timezone =
        typeof body.timezone === "string" && body.timezone.trim()
            ? body.timezone.trim()
            : "America/Sao_Paulo";

    if (enabled) {
        if (weekdays.length < 1 || weekdays.length > 3) {
            return NextResponse.json({ ok: false, error: "WEEKDAYS_INVALID" }, { status: 400 });
        }
        if (!Number.isInteger(hourLocal) || hourLocal < 0 || hourLocal > 23) {
            return NextResponse.json({ ok: false, error: "HOUR_LOCAL_INVALID" }, { status: 400 });
        }
    }

    const upsertPayload = {
        restaurant_id: context.restaurantId,
        campaign_key: "friday_loyal",
        enabled,
        weekdays: enabled ? weekdays : [],
        hour_local: enabled ? hourLocal : 0,
        timezone,
        updated_at: new Date().toISOString(),
    };

    const { error } = await context.supabase
        .from("restaurant_campaign_schedules")
        .upsert(upsertPayload, { onConflict: "restaurant_id,campaign_key" });

    if (tableMissing(error)) {
        return NextResponse.json(
            { ok: false, error: "MIGRATION_REQUIRED", detail: "TABLE_MISSING" },
            { status: 501 }
        );
    }

    if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        schedule: {
            enabled,
            weekdays: enabled ? weekdays : [],
            hour_local: enabled ? hourLocal : 0,
            timezone,
        },
    });
}

