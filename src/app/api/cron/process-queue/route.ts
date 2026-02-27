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
            // --- Dispatch Logic ---
            // Future integration: Send via Uazapi/Fiqon based on msg.intent
            // For now, log the action:
            console.log(`[CRON] Processing scheduled message:`, {
                id: msg.id,
                intent: msg.intent,
                wa_chat_id: msg.wa_chat_id,
                restaurant_id: msg.restaurant_id,
                payload: msg.payload,
            });

            // If an actual network request were here (e.g., fetch Uazapi),
            // and it threw an Error, the code below would NEVER run.

            // Mark as processed (Only happens if dispatch above succeeds)
            await supabase
                .from("scheduled_messages")
                .update({ status: "processed" })
                .eq("id", msg.id);

            processedCount++;
        } catch (err) {
            console.error(`[CRON] Failed to process message ${msg.id}:`, err);
            // Continue with next message — don't let one failure block the batch.
        }
    }

    return NextResponse.json({
        ok: true,
        processed: processedCount,
        total_found: pendingMessages.length,
    });
}
