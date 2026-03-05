import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    CRON_SECRET,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
    UAZAPI_BASE_URL,
    UAZAPI_GLOBAL_API_KEY,
} from "@/lib/shared/env";

export const dynamic = "force-dynamic";

type RestaurantInfo = {
    name?: string | null;
    uaz_instance_token?: string | null;
};

type CartSnapshot = {
    items?: unknown[];
};

type RecoveryRunStatus = "success" | "failed";

function createSupabaseAdminClient() {
    return createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );
}

function normalizeBaseUrl(url: string) {
    return url.replace(/\/$/, "");
}

async function recordRecoveryRun(params: {
    supabase: ReturnType<typeof createSupabaseAdminClient>;
    restaurantId: string;
    chatId: string;
    status: RecoveryRunStatus;
    error: string | null;
    sentiment: string | null;
}) {
    const fingerprint = [
        "recover_cart",
        params.chatId,
        new Date().toISOString().slice(0, 16), // minute granularity
    ].join(":");

    const { error } = await params.supabase.from("automation_runs").insert({
        restaurant_id: params.restaurantId,
        automation_id: null,
        chat_id: params.chatId,
        trigger: "abandoned_cart_recovery",
        fingerprint,
        status: params.status,
        error: params.error,
        context: {
            source: "cron_recover_cart",
            sentiment: params.sentiment,
        },
        created_at: new Date().toISOString(),
        executed_at: new Date().toISOString(),
    });

    if (error) {
        console.warn("[RECOVER CART] Failed to write automation_runs:", error.message);
    }
}

/**
 * Abandoned Cart Recovery Cron
 * 
 * Logic:
 * 1. Find chats with abandoned carts (items in snapshot, but no order/finalized status).
 * 2. Filter by inactivity (e.g., last_activity_at between 30 and 45 minutes ago).
 * 3. Send a friendly recovery message.
 */
export async function GET(req: NextRequest) {
    // Basic auth check
    const authHeader = req.headers.get("authorization");
    const cronSecret = CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const now = new Date();
    const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const fortyFiveMinsAgo = new Date(now.getTime() - 45 * 60 * 1000).toISOString();

    console.log(`[RECOVER CART] Checking for abandoned carts between ${fortyFiveMinsAgo} and ${thirtyMinsAgo}`);

    // Fetch abandoned carts
    // Criteria: 
    // - last_activity_at is older than 30 mins but newer than 45 mins
    // - cart_snapshot is not null
    // - kanban_status is not 'Finalizado' or 'Cancelado'
    const { data: abandonedChats, error } = await supabase
        .from("chats")
        .select(`
            id, 
            wa_chat_id, 
            restaurant_id, 
            cart_snapshot, 
            sentiment,
            restaurants (
                name,
                uaz_instance_token
            )
        `)
        .not("cart_snapshot", "is", null)
        .lt("last_activity_at", thirtyMinsAgo)
        .gt("last_activity_at", fortyFiveMinsAgo)
        .not("kanban_status", "in", "(Finalizado,Cancelado,Entregue)");

    if (error) {
        console.error("[RECOVER CART] DB Error:", error.message);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!abandonedChats || abandonedChats.length === 0) {
        return NextResponse.json({ ok: true, found: 0 });
    }

    const recoveryResults = [];

    for (const chat of abandonedChats) {
        const restaurant = (chat.restaurants ?? null) as RestaurantInfo | null;
        if (!restaurant?.uaz_instance_token) continue;

        // check if cart actually has items
        const snapshot = (chat.cart_snapshot ?? null) as CartSnapshot | null;
        const hasItems = snapshot?.items && Array.isArray(snapshot.items) && snapshot.items.length > 0;
        if (!hasItems) continue;

        const waNumber = chat.wa_chat_id?.split("@")[0]?.replace(/\D/g, "");
        if (!waNumber) continue;

        // Recovery Message Logic
        let message = "Oi! Vi que você deixou uns itens no carrinho. Posso te ajudar a finalizar seu pedido? 😊";
        if (chat.sentiment === "Frustrado") {
            message = "Oi! Vi que você não finalizou seu pedido. Tivemos algum problema? Quero muito te ajudar a ter a melhor experiência possível! 🙏";
        } else if (chat.sentiment === "Satisfeito") {
            message = "Ei! Seus favoritos estão te esperando no carrinho! 🍔 Quer que eu finalize por aqui para você?";
        }

        const baseUrl = UAZAPI_BASE_URL;
        const globalApiKey = UAZAPI_GLOBAL_API_KEY || "";

        try {
            const sendUrl = `${normalizeBaseUrl(baseUrl || "")}/send/text`;
            const response = await fetch(sendUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: globalApiKey,
                    token: restaurant.uaz_instance_token,
                },
                body: JSON.stringify({
                    number: waNumber,
                    text: message,
                }),
                cache: "no-store",
            });

            if (response.ok) {
                // Log and persist
                await supabase.from("messages").insert({
                    chat_id: chat.id,
                    restaurant_id: chat.restaurant_id,
                    direction: "out",
                    text: message,
                    payload: { source: "abandoned_cart_recovery", sentiment: chat.sentiment },
                });

                // Update activity to avoid double recovery
                await supabase.from("chats").update({
                    last_activity_at: new Date().toISOString(), // Bump activity so it skips the next 15min window
                    last_message: message
                }).eq("id", chat.id);

                await recordRecoveryRun({
                    supabase,
                    restaurantId: chat.restaurant_id,
                    chatId: chat.id,
                    status: "success",
                    error: null,
                    sentiment: typeof chat.sentiment === "string" ? chat.sentiment : null,
                });

                recoveryResults.push({ id: chat.id, status: "success" });
            } else {
                const responseError = await response.text();
                await recordRecoveryRun({
                    supabase,
                    restaurantId: chat.restaurant_id,
                    chatId: chat.id,
                    status: "failed",
                    error: responseError,
                    sentiment: typeof chat.sentiment === "string" ? chat.sentiment : null,
                });
                recoveryResults.push({ id: chat.id, status: "failed", error: responseError });
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            await recordRecoveryRun({
                supabase,
                restaurantId: chat.restaurant_id,
                chatId: chat.id,
                status: "failed",
                error: errorMessage,
                sentiment: typeof chat.sentiment === "string" ? chat.sentiment : null,
            });
            recoveryResults.push({ id: chat.id, status: "error", error: errorMessage });
        }
    }

    return NextResponse.json({
        ok: true,
        processed: recoveryResults.length,
        results: recoveryResults
    });
}
