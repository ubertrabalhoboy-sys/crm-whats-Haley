import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Cron Worker: Process Scheduled Messages Queue
 * 
 * Call this endpoint every minute via:
 * - Vercel Cron (vercel.json)
 * - Supabase pg_cron
 * - Inngest / external scheduler
 * 
 * It fetches all `pending` messages where `run_at <= NOW()`,
 * marks them as `processed`, and dispatches them.
 * 
 * Security: Protected by a shared secret (CRON_SECRET).
 */
export async function POST(req: NextRequest) {
    // Validate cron secret to prevent unauthorized execution
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient();

    // Fetch pending messages ready to fire
    const { data: pendingMessages, error: fetchError } = await supabase
        .from("scheduled_messages")
        .select("*")
        .eq("status", "pending")
        .lte("run_at", new Date().toISOString())
        .order("run_at", { ascending: true })
        .limit(50); // Process in batches of 50

    if (fetchError) {
        console.error("[CRON] Error fetching scheduled_messages:", fetchError.message);
        return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    if (!pendingMessages || pendingMessages.length === 0) {
        return NextResponse.json({ ok: true, processed: 0, message: "No pending messages." });
    }

    let processedCount = 0;

    for (const msg of pendingMessages) {
        try {
            // 1. Map wa_chat_id to the internal chat_id (UUID)
            const { data: chat, error: chatError } = await supabase
                .from("chats")
                .select("id")
                .eq("wa_chat_id", msg.wa_chat_id)
                .eq("restaurant_id", msg.restaurant_id)
                .single();

            if (chatError || !chat) {
                console.warn(`[CRON] No chat found for wa_chat_id: ${msg.wa_chat_id}. Skipping.`);
            } else {
                // 2. Dispatch to webhook_logs to trigger Fiqon/Automation
                const { error: logError } = await supabase
                    .from("webhook_logs")
                    .insert({
                        restaurant_id: msg.restaurant_id,
                        chat_id: chat.id,
                        tag_disparada: msg.intent, // e.g. "abandoned_cart"
                        status: "dispatched",
                    });

                if (logError) {
                    console.error(`[CRON] Error inserting webhook_log for message ${msg.id}:`, logError.message);
                } else {
                    console.log(`[CRON] Dispatched intent "${msg.intent}" for chat ${chat.id}`);
                }
            }

            // 3. Mark as processed
            await supabase
                .from("scheduled_messages")
                .update({ status: "processed" })
                .eq("id", msg.id);

            processedCount++;
        } catch (err) {
            console.error(`[CRON] Failed to process message ${msg.id}:`, err);
        }
    }

    return NextResponse.json({
        ok: true,
        processed: processedCount,
        total_found: pendingMessages.length,
    });
}
