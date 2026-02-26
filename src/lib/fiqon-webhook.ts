import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function triggerFiqonWebhook(chatId: string, newStageId: string) {
    console.log('--- INÍCIO DO DISPARO ---');
    console.log('chatId:', chatId, '| newStageId:', newStageId);

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

        console.log('Chat encontrado. restaurant_id:', chat.restaurant_id);

        // 2. Get Automation for this new stage
        console.log('Buscando automação para Stage:', newStageId, '| restaurant_id:', chat.restaurant_id);

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

        console.log('Automação encontrada:', automation ? 'Sim' : 'Não', '| Status:', automation?.enabled, '| Trigger:', automation?.trigger);

        // 3. Condition check
        if (!automation || !automation.enabled || !automation.trigger?.trim()) {
            console.log('[Fiqon Webhook] Condição não atendida. Abortando disparo.');
            return;
        }

        const webhookUrl = process.env.FIQON_WEBHOOK_URL;
        console.log('URL de destino:', webhookUrl || 'ERRO: URL NÃO DEFINIDA NO RENDER');

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

        console.log('[Fiqon Webhook] Payload:', JSON.stringify(payload));

        fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        }).then(response => {
            if (!response.ok) {
                console.error("[Fiqon Webhook] Fiqon respondeu com status:", response.status);
            } else {
                console.log(`[Fiqon Webhook] ✅ Sucesso! Tag '${payload.tag_disparada}' disparada para chat ${chatId}`);
            }
        }).catch(err => {
            console.error('ERRO FATAL NO FETCH:', err.message);
        });

        console.log('--- FIM DO DISPARO (fetch em andamento) ---');
    } catch (error) {
        console.error("[Fiqon Webhook] Erro inesperado:", error);
    }
}
