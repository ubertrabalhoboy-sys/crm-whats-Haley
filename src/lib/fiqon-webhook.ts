import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function triggerFiqonWebhook(chatId: string, newStageId: string) {
    try {
        const supabase = await createSupabaseServerClient();

        // 1. Get Chat details
        const { data: chat, error: chatError } = await supabase
            .from("chats")
            .select("wa_chat_id, origem_lead, cupom_ganho, restaurant_id")
            .eq("id", chatId)
            .single();

        if (chatError || !chat) {
            console.error("[Fiqon Webhook] Error fetching chat:", chatError?.message);
            return;
        }

        // 2. Get Automation for this new stage
        const { data: automation, error: autoError } = await supabase
            .from("automations")
            .select("enabled, trigger")
            .eq("stage_id", newStageId)
            .eq("restaurant_id", chat.restaurant_id)
            .maybeSingle();

        if (autoError) {
            console.error("[Fiqon Webhook] Error fetching automation:", autoError?.message);
            return;
        }

        // 3. Condition check
        if (automation && automation.enabled && automation.trigger?.trim()) {
            const webhookUrl = process.env.FIQON_WEBHOOK_URL;

            if (!webhookUrl) {
                console.warn("[Fiqon Webhook] FIQON_WEBHOOK_URL is not set in environment variables.");
                return;
            }

            // 4. Fire-and-forget POST request
            const payload = {
                chat_id: chatId,
                telefone: chat.wa_chat_id,
                origem_lead: chat.origem_lead,
                cupom_ganho: chat.cupom_ganho,
                tag_disparada: automation.trigger.trim()
            };

            fetch(webhookUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            }).then(response => {
                if (!response.ok) {
                    console.error("[Fiqon Webhook] Fiqon API responded with status:", response.status);
                } else {
                    console.log(`[Fiqon Webhook] Successfully triggered tag '${payload.tag_disparada}' for chat ${chatId}`);
                }
            }).catch(err => {
                console.error("[Fiqon Webhook] Fetch error:", err);
            });
        }
    } catch (error) {
        console.error("[Fiqon Webhook] Unexpected error:", error);
    }
}
