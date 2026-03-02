import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildFollowupReminderText } from "@/lib/ai/toolRules";

export const dynamic = "force-dynamic";

type ScheduledMessageRow = {
    id: string;
    restaurant_id: string;
    wa_chat_id: string;
    intent: string;
    payload: unknown;
};

type ChatRow = {
    id: string;
    wa_chat_id: string | null;
    cart_snapshot?: unknown;
    kanban_status?: string | null;
    cupom_ganho?: string | null;
};

type RestaurantRow = {
    name?: string | null;
    uaz_instance_token?: string | null;
};

function createSupabaseAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

function normalizeBaseUrl(url: string) {
    return url.replace(/\/$/, "");
}

function asRecord(value: unknown) {
    if (typeof value === "object" && value !== null) {
        return value as Record<string, unknown>;
    }

    return null;
}

function parseJsonSafe(value: string) {
    try {
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
}

function getScheduledPayloadText(payload: unknown) {
    const payloadRecord = asRecord(payload);
    if (typeof payloadRecord?.custom_text === "string" && payloadRecord.custom_text.trim()) {
        return payloadRecord.custom_text.trim();
    }

    return "";
}

function getResumeContext(payload: unknown) {
    const payloadRecord = asRecord(payload);
    return asRecord(payloadRecord?.resume_context);
}

function cleanNumberFromWaChatId(waChatId: string | null) {
    if (!waChatId) {
        return "";
    }

    return waChatId.split("@")[0]?.replace(/\D/g, "") || "";
}

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

    const supabase = createSupabaseAdminClient();
    const baseUrl = process.env.UAZAPI_BASE_URL;
    const globalApiKey = process.env.UAZAPI_GLOBAL_API_KEY || "";

    if (!baseUrl) {
        return NextResponse.json(
            { ok: false, error: "UAZAPI_BASE_URL_NOT_CONFIGURED" },
            { status: 500 }
        );
    }

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

    for (const rawMessage of pendingMessages as ScheduledMessageRow[]) {
        try {
            const payloadRecord = asRecord(rawMessage.payload);
            const payloadChatId =
                typeof payloadRecord?.chat_id === "string" ? payloadRecord.chat_id : null;

            let chatQuery = supabase
                .from("chats")
                .select("id, wa_chat_id, cart_snapshot, kanban_status, cupom_ganho")
                .eq("restaurant_id", rawMessage.restaurant_id);

            chatQuery = payloadChatId
                ? chatQuery.eq("id", payloadChatId)
                : chatQuery.eq("wa_chat_id", rawMessage.wa_chat_id);

            const { data: chat, error: chatError } = await chatQuery.maybeSingle();

            if (chatError || !chat) {
                console.warn(
                    `[CRON] No chat found for scheduled message ${rawMessage.id}.`
                );
                await supabase
                    .from("scheduled_messages")
                    .update({ status: "failed" })
                    .eq("id", rawMessage.id);
                continue;
            }

            const typedChat = chat as ChatRow;
            const { data: restaurant, error: restaurantError } = await supabase
                .from("restaurants")
                .select("name, uaz_instance_token")
                .eq("id", rawMessage.restaurant_id)
                .maybeSingle();

            const typedRestaurant = (restaurant || null) as RestaurantRow | null;
            if (restaurantError || !typedRestaurant?.uaz_instance_token) {
                console.warn(
                    `[CRON] Missing instance token for restaurant ${rawMessage.restaurant_id}.`
                );
                await supabase
                    .from("scheduled_messages")
                    .update({ status: "failed" })
                    .eq("id", rawMessage.id);
                continue;
            }

            const resumeContext = getResumeContext(rawMessage.payload);
            const reminderText =
                getScheduledPayloadText(rawMessage.payload) ||
                buildFollowupReminderText({
                    intent: rawMessage.intent,
                    cartSnapshot:
                        typedChat.cart_snapshot ?? resumeContext?.cart_snapshot ?? null,
                    kanbanStatus:
                        (typeof typedChat.kanban_status === "string"
                            ? typedChat.kanban_status
                            : null) ||
                        (typeof resumeContext?.kanban_status === "string"
                            ? resumeContext.kanban_status
                            : null),
                    cupomGanho:
                        (typeof typedChat.cupom_ganho === "string"
                            ? typedChat.cupom_ganho
                            : null) ||
                        (typeof resumeContext?.cupom_ganho === "string"
                            ? resumeContext.cupom_ganho
                            : null),
                    explicitText: null,
                });

            const number = cleanNumberFromWaChatId(
                typedChat.wa_chat_id || rawMessage.wa_chat_id
            );
            if (!number) {
                console.warn(`[CRON] Missing phone number for chat ${typedChat.id}.`);
                await supabase
                    .from("scheduled_messages")
                    .update({ status: "failed" })
                    .eq("id", rawMessage.id);
                continue;
            }

            const sendUrl = `${normalizeBaseUrl(baseUrl)}/send/text`;
            const sendResponse = await fetch(sendUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: globalApiKey,
                    token: typedRestaurant.uaz_instance_token,
                },
                body: JSON.stringify({
                    number,
                    text: reminderText,
                }),
                cache: "no-store",
            });
            const rawSendBody = await sendResponse.text();
            const parsedSendBody = parseJsonSafe(rawSendBody);

            if (!sendResponse.ok) {
                console.error(`[CRON] Failed to deliver scheduled message ${rawMessage.id}:`, parsedSendBody ?? rawSendBody);
                await supabase
                    .from("scheduled_messages")
                    .update({ status: "failed" })
                    .eq("id", rawMessage.id);
                continue;
            }

            const waMessageId =
                parsedSendBody &&
                typeof parsedSendBody === "object" &&
                "id" in parsedSendBody &&
                typeof parsedSendBody.id === "string"
                    ? parsedSendBody.id
                    : parsedSendBody &&
                      typeof parsedSendBody === "object" &&
                      "messageId" in parsedSendBody &&
                      typeof parsedSendBody.messageId === "string"
                        ? parsedSendBody.messageId
                        : null;

            await supabase.from("messages").insert({
                chat_id: typedChat.id,
                restaurant_id: rawMessage.restaurant_id,
                direction: "out",
                wa_message_id: waMessageId,
                text: reminderText,
                payload: {
                    source: "scheduled_followup",
                    scheduled_message_id: rawMessage.id,
                    intent: rawMessage.intent,
                    resume_context: resumeContext || null,
                    uaz: parsedSendBody ?? rawSendBody,
                },
            });

            await supabase
                .from("chats")
                .update({
                    last_message: reminderText,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", typedChat.id)
                .eq("restaurant_id", rawMessage.restaurant_id);

            const { error: logError } = await supabase
                .from("webhook_logs")
                .insert({
                    restaurant_id: rawMessage.restaurant_id,
                    chat_id: typedChat.id,
                    tag_disparada: rawMessage.intent,
                    status: "dispatched",
                });

            if (logError) {
                console.error(
                    `[CRON] Error inserting webhook_log for message ${rawMessage.id}:`,
                    logError.message
                );
            } else {
                console.log(
                    `[CRON] Dispatched intent "${rawMessage.intent}" for chat ${typedChat.id}`
                );
            }

            await supabase
                .from("scheduled_messages")
                .update({ status: "processed" })
                .eq("id", rawMessage.id);

            processedCount++;
        } catch (err) {
            const messageId =
                typeof (rawMessage as { id?: unknown }).id === "string"
                    ? (rawMessage as { id: string }).id
                    : "unknown";
            console.error(`[CRON] Failed to process message ${messageId}:`, err);
        }
    }

    return NextResponse.json({
        ok: true,
        processed: processedCount,
        total_found: pendingMessages.length,
    });
}
