import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const supabase = await createSupabaseServerClient();

    // As this is for the AI, it should receive the restaurant_id in query 
    // or rely on a generic auth if the AI uses an API key. 
    // Here we'll take restaurant_id from the query params.
    const restaurantId = req.nextUrl.searchParams.get("restaurant_id");

    if (!restaurantId) {
        return NextResponse.json({ ok: false, error: "MISSING_RESTAURANT_ID" }, { status: 400 });
    }

    const { data: restaurant, error } = await supabase
        .from("restaurants")
        .select("name, store_address, operating_hours")
        .eq("id", restaurantId)
        .single();

    if (error || !restaurant) {
        return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_FOUND" }, { status: 404 });
    }

    // Determine if open right now in America/Sao_Paulo timezone
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { timeZone: "America/Sao_Paulo", weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false };
    const spTime = new Intl.DateTimeFormat("en-US", options).format(now);
    // spTime pattern: "Monday, 14:30"

    const [weekdayStr, timeStr] = spTime.split(", ");

    const daysMap: Record<string, string> = {
        "Monday": "segunda",
        "Tuesday": "terca",
        "Wednesday": "quarta",
        "Thursday": "quinta",
        "Friday": "sexta",
        "Saturday": "sabado",
        "Sunday": "domingo"
    };
    const currentDayKey = daysMap[weekdayStr];

    const hours = restaurant.operating_hours as Record<string, { open: string; close: string; isClosed: boolean }> || {};
    const todayHours = hours[currentDayKey];

    let isOpenNow = false;

    if (todayHours && !todayHours.isClosed && todayHours.open && todayHours.close) {
        const [currH, currM] = timeStr.split(":").map(Number);
        const [openH, openM] = todayHours.open.split(":").map(Number);
        const [closeH, closeM] = todayHours.close.split(":").map(Number);

        const currTotalMins = currH * 60 + currM;
        const openTotalMins = openH * 60 + openM;
        const closeTotalMins = closeH * 60 + closeM;

        if (closeTotalMins < openTotalMins) {
            // Passes midnight (e.g., 18:00 to 02:00)
            if (currTotalMins >= openTotalMins || currTotalMins <= closeTotalMins) {
                isOpenNow = true;
            }
        } else {
            // Normal day (e.g., 10:00 to 22:00)
            if (currTotalMins >= openTotalMins && currTotalMins <= closeTotalMins) {
                isOpenNow = true;
            }
        }
    }

    return NextResponse.json({
        ok: true,
        store_info: {
            name: restaurant.name,
            store_address: restaurant.store_address,
            is_open_now: isOpenNow,
            current_day: currentDayKey,
            current_time_sp: timeStr,
            operating_hours: hours
        }
    });
}
