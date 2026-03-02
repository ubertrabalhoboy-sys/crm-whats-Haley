import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type StoreInfoRow = {
    name: string | null;
    store_address: string | null;
    operating_hours: unknown;
    business_rules?: unknown;
};

export async function GET(req: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const restaurantId = req.nextUrl.searchParams.get("restaurant_id");

    if (!restaurantId) {
        return NextResponse.json({ ok: false, error: "MISSING_RESTAURANT_ID" }, { status: 400 });
    }

    let restaurantQuery = await supabase
        .from("restaurants")
        .select("name, store_address, operating_hours, business_rules")
        .eq("id", restaurantId)
        .single();

    if (restaurantQuery.error?.message?.includes("business_rules")) {
        restaurantQuery = await supabase
            .from("restaurants")
            .select("name, store_address, operating_hours")
            .eq("id", restaurantId)
            .single();
    }

    const { data: restaurant, error } = restaurantQuery;

    if (error || !restaurant) {
        return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_FOUND" }, { status: 404 });
    }

    const typedRestaurant = restaurant as StoreInfoRow;

    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
        timeZone: "America/Sao_Paulo",
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    };
    const spTime = new Intl.DateTimeFormat("en-US", options).format(now);
    const [weekdayStr, timeStr] = spTime.split(", ");

    const daysMap: Record<string, string> = {
        Monday: "segunda",
        Tuesday: "terca",
        Wednesday: "quarta",
        Thursday: "quinta",
        Friday: "sexta",
        Saturday: "sabado",
        Sunday: "domingo",
    };
    const currentDayKey = daysMap[weekdayStr];

    const hours =
        (typedRestaurant.operating_hours as Record<
            string,
            { open: string; close: string; isClosed: boolean }
        >) || {};
    const todayHours = currentDayKey ? hours[currentDayKey] : undefined;

    let isOpenNow = false;

    if (todayHours && !todayHours.isClosed && todayHours.open && todayHours.close) {
        const [currH, currM] = timeStr.split(":").map(Number);
        const [openH, openM] = todayHours.open.split(":").map(Number);
        const [closeH, closeM] = todayHours.close.split(":").map(Number);

        const currTotalMins = currH * 60 + currM;
        const openTotalMins = openH * 60 + openM;
        const closeTotalMins = closeH * 60 + closeM;

        if (closeTotalMins < openTotalMins) {
            if (currTotalMins >= openTotalMins || currTotalMins <= closeTotalMins) {
                isOpenNow = true;
            }
        } else if (
            currTotalMins >= openTotalMins &&
            currTotalMins <= closeTotalMins
        ) {
            isOpenNow = true;
        }
    }

    return NextResponse.json({
        ok: true,
        store_info: {
            name: typedRestaurant.name,
            store_address: typedRestaurant.store_address,
            is_open_now: isOpenNow,
            current_day: currentDayKey,
            current_time_sp: timeStr,
            operating_hours: hours,
            business_rules:
                typeof typedRestaurant.business_rules !== "undefined"
                    ? typedRestaurant.business_rules
                    : null,
        },
    });
}
