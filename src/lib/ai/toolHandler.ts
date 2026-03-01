import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────
// AI Tool Execution Handler
// ─────────────────────────────────────────────────
// This module maps LLM tool_call names to internal
// API routes and Supabase operations.
//
// Usage (from your webhook / agent orchestrator):
//   const result = await executeAiTool(toolName, args, ctx);
//   // result is a JSON-stringified response to feed back to the LLM
// ─────────────────────────────────────────────────

export type ToolContext = {
    restaurant_id: string;
    wa_chat_id?: string;
    chat_id?: string;
    base_url: string; // e.g. "https://your-app.vercel.app" or "http://localhost:3000"
};

/**
 * Creates a Supabase admin client (service role) that bypasses RLS.
 * Used only for server-side tool execution where there's no browser session.
 */
function createAdminClient(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

/**
 * Main dispatcher — maps a tool name to its handler.
 * Returns a JSON string to feed back into the LLM's tool_call response.
 */
export async function executeAiTool(
    toolName: string,
    args: Record<string, unknown>,
    ctx: ToolContext
): Promise<string> {
    const handlers: Record<string, () => Promise<unknown>> = {
        get_store_info: () => handleGetStoreInfo(ctx),
        search_product_catalog: () => handleSearchProductCatalog(args, ctx),
        calculate_cart_total: () => handleCalculateCartTotal(args, ctx),
        submit_final_order: () => handleSubmitFinalOrder(args, ctx),
        get_pix_payment: () => handleGetPixPayment(args, ctx),
        schedule_proactive_followup: () => handleScheduleFollowup(args, ctx),
        send_uaz_carousel: () => handleSendUazCarousel(args, ctx),
        send_uaz_list_menu: () => handleSendUazListMenu(args, ctx),
        request_user_location: () => handleRequestUserLocation(ctx),
        move_kanban_stage: () => handleMoveKanbanStage(args, ctx),
    };

    const handler = handlers[toolName];

    if (!handler) {
        return JSON.stringify({
            error: "UNKNOWN_TOOL",
            message: `Tool "${toolName}" is not registered in the handler.`,
        });
    }

    try {
        const result = await handler();
        return JSON.stringify(result);
    } catch (err: any) {
        console.error(`[AI_TOOL_HANDLER] Error executing "${toolName}":`, err);
        return JSON.stringify({
            error: "TOOL_EXECUTION_ERROR",
            message: err.message || "Unknown error during tool execution.",
        });
    }
}

// ─────────────────────────────────────────────────
// Individual Tool Handlers
// ─────────────────────────────────────────────────

/**
 * get_store_info — Retorna os dados da loja direto do banco (Sem delay de rede)
 */
async function handleGetStoreInfo(ctx: ToolContext) {
    const db = createAdminClient();

    // Busca tudo do restaurante direto no Supabase
    const { data, error } = await db
        .from("restaurants")
        .select("*") // Puxa todos os dados (horários, endereço, etc)
        .eq("id", ctx.restaurant_id)
        .single();

    if (error) {
        console.error("[TOOL: get_store_info] Erro no banco:", error.message);
        return { ok: false, error: error.message };
    }

    return {
        ok: true,
        store_info: data
    };
}

/**
 * search_product_catalog — Queries produtos_promo with optional category filter
 * Args: { category?: "principal" | "bebida" | "adicional" }
 */
async function handleSearchProductCatalog(
    args: Record<string, unknown>,
    ctx: ToolContext
) {
    const db = createAdminClient();
    let query = db
        .from("produtos_promo")
        .select("id, nome, description, preco_original, preco_promo, estoque, imagem_url, category, is_extra")
        .eq("restaurant_id", ctx.restaurant_id);

    if (args.category && typeof args.category === "string") {
        query = query.eq("category", args.category);
    }

    const { data, error } = await query.order("nome");

    if (error) return { ok: false, error: error.message };
    return { ok: true, products: data };
}

/**
 * calculate_cart_total — Calcula direto no banco (Sem fetch)
 * Args: { items, cupom_code?, customer_address? }
 */
async function handleCalculateCartTotal(args: Record<string, unknown>, ctx: ToolContext) {
    const db = createAdminClient();
    const items = args.items as any[] || [];

    let subtotal = 0;

    // Busca os preços reais no banco para evitar que a IA ou usuário "invente" valores
    for (const item of items) {
        const { data: promo } = await db
            .from("produtos_promo")
            .select("preco_promo, preco_original")
            .eq("id", item.product_id)
            .maybeSingle();

        if (promo) {
            // Usa o preco_promo se existir, senão usa o original
            const price = promo.preco_promo || promo.preco_original || 0;
            subtotal += (price * item.quantity);
        }
    }

    // Lógica simplificada de frete (você pode customizar conforme sua regra real)
    const delivery_fee = args.customer_address ? 5.00 : 0;
    const discount = 0; // Lógica de cupom pode ser inserida aqui

    const total = subtotal + delivery_fee - discount;

    return {
        ok: true,
        subtotal,
        delivery_fee,
        discount,
        total,
        items_processed: items.length
    };
}

/**
 * submit_final_order — POST /api/order/submit
 * Args: { chat_id, items, subtotal, discount, delivery_fee, total,
 *          payment_method, change_for, address_number, address_reference, gps_location }
 *
 * NOTE: This route requires auth. For AI execution, we insert directly via admin client
 * to bypass cookie-based auth while maintaining data integrity.
 */
async function handleSubmitFinalOrder(
    args: Record<string, unknown>,
    ctx: ToolContext
) {
    const db = createAdminClient();

    // Validation layer (mirrors /api/order/submit)
    if (!args.address_number) {
        return {
            ok: false,
            error: "MISSING_ADDRESS_NUMBER",
            ai_instruction: "Ask the user for the house number.",
        };
    }
    if (!args.payment_method) {
        return {
            ok: false,
            error: "MISSING_PAYMENT_METHOD",
            ai_instruction: "Ask the user for the payment method: PIX, Dinheiro, or Cartão.",
        };
    }
    if (!args.items || !Array.isArray(args.items) || args.items.length === 0) {
        return {
            ok: false,
            error: "MISSING_ITEMS",
            ai_instruction: "The order has no items. Ask the user what they would like to order.",
        };
    }
    if (args.payment_method === "dinheiro" && !args.change_for) {
        return {
            ok: false,
            error: "MISSING_CHANGE_FOR",
            ai_instruction: "The user selected cash. Ask: 'Precisa de troco para quanto?'",
        };
    }

    const chatId = (args.chat_id as string) || ctx.chat_id;

    // 🛡️ SECURITY: recalculate prices to avoid prompt injection 🛡️
    let realSubtotal = 0;
    for (const item of (args.items as any[])) {
        const { data: promo } = await db.from("produtos_promo").select("price").eq("id", item.product_id).maybeSingle();
        if (promo) {
            realSubtotal += (promo.price * item.quantity);
        }
    }

    const calculatedTotal = realSubtotal - (args.discount as number || 0) + (args.delivery_fee as number || 0);

    const { data: order, error } = await db
        .from("orders")
        .insert({
            restaurant_id: ctx.restaurant_id,
            chat_id: chatId,
            items: args.items,
            subtotal: realSubtotal,
            discount: args.discount || 0,
            delivery_fee: args.delivery_fee || 0,
            total: calculatedTotal,
            payment_method: args.payment_method,
            change_for: args.change_for || null,
            address_number: args.address_number,
            address_reference: (args.address_reference as string) || null,
            gps_location: (args.gps_location as string) || null,
            status: "received",
        })
        .select()
        .single();

    if (error) return { ok: false, error: error.message };

    // Log ORDER_CREATED webhook event
    await db.from("webhook_logs").insert({
        restaurant_id: ctx.restaurant_id,
        chat_id: chatId,
        tag_disparada: "ORDER_CREATED",
        status: "dispatched",
    });

    console.log("[ORDER_CREATED] via AI tool:", order.id);

    return {
        ok: true,
        order_id: order.id,
        message: "Pedido registrado com sucesso!",
        webhook_dispatched: true,
    };
}

/**
 * get_pix_payment — POST /api/order/pix
 * Args: { chat_id, amount }
 */
async function handleGetPixPayment(
    args: Record<string, unknown>,
    ctx: ToolContext
) {
    const db = createAdminClient();
    const chatId = (args.chat_id as string) || ctx.chat_id;
    const amount = Number(args.amount);

    if (!amount || amount <= 0) {
        return { ok: false, error: "MISSING_AMOUNT" };
    }

    const { data: restaurant } = await db
        .from("restaurants")
        .select("name, pix_key")
        .eq("id", ctx.restaurant_id)
        .single();

    if (!restaurant?.pix_key) {
        return { ok: false, error: "PIX_KEY_NOT_CONFIGURED", ai_instruction: "No PIX key is configured for this store." };
    }

    const { data: chat } = await db
        .from("chats")
        .select("wa_chat_id")
        .eq("id", chatId)
        .eq("restaurant_id", ctx.restaurant_id)
        .single();

    const pixPayload = {
        phone: chat?.wa_chat_id || ctx.wa_chat_id,
        pix: {
            key: restaurant.pix_key,
            name: restaurant.name || "Loja",
            amount: Number(amount.toFixed(2)),
            description: `Pedido via ${restaurant.name || "FoodSpin"}`,
        },
        message: `💰 *Pagamento PIX*\n\nValor: R$ ${amount.toFixed(2)}\nEstabelecimento: ${restaurant.name}\n\n✅ Após o pagamento, envie o comprovante aqui!`,
    };

    return {
        ok: true,
        pix_payload: pixPayload,
    };
}

/**
 * schedule_proactive_followup — Inserts into scheduled_messages
 * Args: { minutes_delay, intent, payload? }
 */
async function handleScheduleFollowup(
    args: Record<string, unknown>,
    ctx: ToolContext
) {
    const db = createAdminClient();

    const minutesDelay = Number(args.minutes_delay) || 30;
    const runAt = new Date(Date.now() + minutesDelay * 60 * 1000).toISOString();

    const { data, error } = await db
        .from("scheduled_messages")
        .insert({
            restaurant_id: ctx.restaurant_id,
            wa_chat_id: ctx.wa_chat_id || "",
            run_at: runAt,
            intent: (args.intent as string) || "follow_up",
            payload: args.payload || {},
            status: "pending",
        })
        .select()
        .single();

    if (error) return { ok: false, error: error.message };

    return {
        ok: true,
        scheduled_id: data.id,
        run_at: runAt,
        message: `Follow-up agendado para ${minutesDelay} minutos.`,
    };
}

/**
 * send_uaz_carousel — Returns Uazapi-formatted carousel JSON
 * Args: { phone, products: [{ title, description, image_url, price, product_id }] }
 */
async function handleSendUazCarousel(
    args: Record<string, unknown>,
    _ctx: ToolContext
) {
    const products = (args.products as any[]) || [];

    const cards = products.map((p: any) => ({
        title: p.title || p.nome || "Produto",
        description: p.description || `R$ ${Number(p.price || 0).toFixed(2)}`,
        mediaUrl: p.image_url || p.imagem_url || "",
        buttons: [
            {
                buttonId: `add_to_cart_${p.product_id || p.id}`,
                buttonText: { displayText: "🛒 Adicionar" },
                type: 1,
            },
        ],
    }));

    return {
        ok: true,
        uazapi_payload: {
            phone: args.phone || _ctx.wa_chat_id,
            isCarousel: true,
            carousel: cards,
        },
    };
}

/**
 * send_uaz_list_menu — Returns Uazapi-formatted list menu JSON
 * Args: { phone, title, button_text, sections: [{ title, rows: [{ id, title, description }] }] }
 */
async function handleSendUazListMenu(
    args: Record<string, unknown>,
    _ctx: ToolContext
) {
    return {
        ok: true,
        uazapi_payload: {
            phone: args.phone || _ctx.wa_chat_id,
            listMessage: {
                title: args.title || "Cardápio",
                buttonText: args.button_text || "Ver Opções",
                description: args.description || "Escolha uma opção abaixo:",
                sections: args.sections || [],
                listType: 1,
            },
        },
    };
}

/**
 * request_user_location — Returns Uazapi payload requesting GPS
 * No specific args needed, uses context.
 */
async function handleRequestUserLocation(ctx: ToolContext) {
    return {
        ok: true,
        uazapi_payload: {
            phone: ctx.wa_chat_id,
            buttonMessage: {
                contentText: "📍 Para calcular o frete, preciso da sua localização. Clique no botão abaixo:",
                footerText: "FoodSpin Delivery",
                buttons: [
                    {
                        buttonId: "send_location",
                        buttonText: { displayText: "📍 Enviar Localização" },
                        type: 1,
                    },
                ],
                headerType: 1,
            },
        },
    };
}

/**
 * move_kanban_stage — Updates stage_id on chats table
 * Args: { chat_id, stage_name }
 */
async function handleMoveKanbanStage(
    args: Record<string, unknown>,
    ctx: ToolContext
) {
    const db = createAdminClient();
    const chatId = (args.chat_id as string) || ctx.chat_id;
    const stageName = args.stage_name as string;

    if (!chatId || !stageName) {
        return {
            ok: false,
            error: "MISSING_ARGS",
            ai_instruction: "Both chat_id and stage_name are required.",
        };
    }

    // Find the stage by name for this restaurant
    const { data: stage, error: stageError } = await db
        .from("kanban_stages")
        .select("id")
        .eq("restaurant_id", ctx.restaurant_id)
        .eq("name", stageName)
        .maybeSingle();

    if (stageError || !stage) {
        return {
            ok: false,
            error: "STAGE_NOT_FOUND",
            message: `Stage "${stageName}" not found for this restaurant.`,
        };
    }

    // Update the chat's stage
    const { error: updateError } = await db
        .from("chats")
        .update({ stage_id: stage.id })
        .eq("id", chatId);

    if (updateError) return { ok: false, error: updateError.message };

    return {
        ok: true,
        message: `Lead moved to stage "${stageName}".`,
        new_stage_id: stage.id,
    };
}
