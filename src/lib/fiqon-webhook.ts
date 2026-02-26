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
            console.error("[Fiqon Webhook] Erro ao buscar chat:", chatError?.message);
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
            console.error("[Fiqon Webhook] Erro ao buscar automação:", autoError.message);
            return;
        }

        // 3. Condition check
        if (!automation || !automation.enabled || !automation.trigger?.trim()) {
            return;
        }

        const webhookUrl = process.env.FIQON_WEBHOOK_URL;

        if (!webhookUrl) {
            console.error("[Fiqon Webhook] FIQON_WEBHOOK_URL não definida.");
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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }).then(async response => {
            const status = response.ok ? "success" : "error";
            if (!response.ok) {
                console.error(`[Fiqon Webhook] Falha - status ${response.status} para chat ${chatId}`);
            } else {
                console.log(`[Fiqon Webhook] OK - tag '${payload.tag_disparada}' enviada para chat ${chatId}`);
            }
            // Log to webhook_logs
            await supabase.from("webhook_logs").insert({
                restaurant_id: chat.restaurant_id,
                chat_id: chatId,
                tag_disparada: payload.tag_disparada,
                status
            });
        }).catch(async err => {
            console.error("[Fiqon Webhook] Erro no fetch:", err.message);
            await supabase.from("webhook_logs").insert({
                restaurant_id: chat.restaurant_id,
                chat_id: chatId,
                tag_disparada: payload.tag_disparada,
                status: "error"
            });
        });
    } catch (error) {
        console.error("[Fiqon Webhook] Erro inesperado:", error);
    }
}
