import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { processAiMessage } from "@/lib/ai/orchestrator";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ restaurantId: string }> }
) {
    try {
        const { restaurantId } = await params;

        const body = await req.json();
        const nome = (body.nome || "").trim();
        const whatsapp = (body.whatsapp || "").replace(/\D/g, "").trim();

        if (!nome || !whatsapp || whatsapp.length < 10) {
            return NextResponse.json({ ok: false, error: "Nome e WhatsApp válidos são obrigatórios." }, { status: 400 });
        }

        // 1. Anti-fraude: 1 giro por WhatsApp por restaurante (permanente)
        const { data: alreadyPlayed } = await supabaseServer
            .from("chats")
            .select("id")
            .eq("restaurant_id", restaurantId)
            .eq("wa_chat_id", whatsapp)
            .eq("origem_lead", "Roleta")
            .limit(1)
            .maybeSingle();

        if (alreadyPlayed) {
            return NextResponse.json({ ok: false, error: "already_played", message: "Este WhatsApp já participou desta promoção!" }, { status: 403 });
        }

        // 2. Buscar prêmios do restaurante
        const { data: prizes, error: prizesError } = await supabaseServer
            .from("roulette_prizes")
            .select("*")
            .eq("restaurant_id", restaurantId)
            .order("created_at", { ascending: true });

        if (prizesError || !prizes || prizes.length === 0) {
            return NextResponse.json({ ok: false, error: "Nenhum prêmio configurado." }, { status: 404 });
        }

        // 3. Weighted Random — sortear por chance_percentage
        const roll = Math.random() * 100;
        let cumulative = 0;
        let winnerIndex = 0;

        for (let i = 0; i < prizes.length; i++) {
            cumulative += prizes[i].chance_percentage;
            if (roll < cumulative) {
                winnerIndex = i;
                break;
            }
        }

        const prize = prizes[winnerIndex];

        // 4. Buscar primeira coluna do Kanban
        const { data: firstStage } = await supabaseServer
            .from("kanban_stages")
            .select("id, name")
            .eq("restaurant_id", restaurantId)
            .order("position", { ascending: true })
            .limit(1)
            .maybeSingle();

        const kanbanStatus = firstStage?.name || "Novo";

        // 5. Criar ou atualizar contato
        const { data: existingContact } = await supabaseServer
            .from("contacts")
            .select("id")
            .eq("restaurant_id", restaurantId)
            .eq("phone", whatsapp)
            .maybeSingle();

        let contactId: string;

        if (existingContact?.id) {
            contactId = existingContact.id;
        } else {
            const { data: newContact, error: contactError } = await supabaseServer
                .from("contacts")
                .insert({ restaurant_id: restaurantId, phone: whatsapp, name: nome })
                .select("id")
                .single();

            if (contactError || !newContact) {
                console.error("[Spin] Erro ao criar contato:", contactError?.message);
                return NextResponse.json({ ok: false, error: "Falha ao registrar contato." }, { status: 500 });
            }
            contactId = newContact.id;
        }

        // 6. Criar chat no Kanban
        const prizeMessage = `🎰 Roleta: ${prize.label}`;
        const { data: newChat, error: chatError } = await supabaseServer
            .from("chats")
            .insert({
                restaurant_id: restaurantId,
                wa_chat_id: whatsapp,
                contact_id: contactId,
                origem_lead: "Roleta",
                cupom_ganho: prize.label,
                kanban_status: kanbanStatus,
                last_message: prizeMessage,
                unread_count: 1,
            })
            .select("id")
            .single();

        if (chatError || !newChat) {
            console.error("[Spin] Erro ao criar chat:", chatError?.message);
            return NextResponse.json({ ok: false, error: "Falha ao registrar lead." }, { status: 500 });
        }

        // 6.1 Registrar a primeira mensagem no histórico para a IA ver
        await supabaseServer.from("messages").insert({
            restaurant_id: restaurantId,
            chat_id: newChat.id,
            direction: "in",
            text: prizeMessage,
            status: "read"
        });

        // 7. Disparar Webhook do Fiqon (fire-and-forget)
        if (firstStage?.id) {
            // Check automation for this stage
            const { data: automation } = await supabaseServer
                .from("automations")
                .select("enabled, trigger")
                .eq("stage_id", firstStage.id)
                .eq("restaurant_id", restaurantId)
                .maybeSingle();

            const webhookUrl = process.env.FIQON_WEBHOOK_URL;

            if (automation?.enabled && automation.trigger?.trim() && webhookUrl) {
                const payload = {
                    chat_id: newChat.id,
                    telefone: whatsapp,
                    origem_lead: "Roleta",
                    cupom_ganho: prize.label,
                    tag_disparada: prize.trigger_tag,
                };

                fetch(webhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }).then(async res => {
                    const status = res.ok ? "success" : "error";
                    if (!res.ok) console.error(`[Spin Webhook] Falha - status ${res.status}`);
                    await supabaseServer.from("webhook_logs").insert({
                        restaurant_id: restaurantId,
                        chat_id: newChat.id,
                        tag_disparada: prize.trigger_tag,
                        status,
                    });
                }).catch(async err => {
                    console.error("[Spin Webhook] Erro:", err.message);
                    await supabaseServer.from("webhook_logs").insert({
                        restaurant_id: restaurantId,
                        chat_id: newChat.id,
                        tag_disparada: prize.trigger_tag,
                        status: "error",
                    });
                });
            }
        }

        // 7.1 ACORDAR A IA (PROATIVA)
        // Buscamos o nome da instância para enviar a msg
        const { data: inst } = await supabaseServer
            .from("restaurants")
            .select("uaz_instance_name")
            .eq("id", restaurantId)
            .single();

        // Disparar o orquestrador (não aguardamos a resposta para não travar o frontend)
        processAiMessage({
            restaurantId,
            chatId: newChat.id,
            waChatId: whatsapp,
            incomingText: prizeMessage,
            instanceName: inst?.uaz_instance_name || undefined
        }).catch(e => console.error("[Spin IA Trigger] Failed:", e));

        // 8. Retornar resultado ao frontend
        return NextResponse.json({
            ok: true,
            winnerIndex,
            prize: {
                label: prize.label,
                color: prize.color,
            },
            totalPrizes: prizes.length,
        });
    } catch (error) {
        console.error("[Spin] Erro inesperado:", error);
        return NextResponse.json({ ok: false, error: "Erro interno do servidor." }, { status: 500 });
    }
}
