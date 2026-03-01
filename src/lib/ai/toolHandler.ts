import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type ToolContext = {
    restaurant_id: string;
    wa_chat_id?: string;
    chat_id?: string;
    base_url: string; 
};

function createAdminClient(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

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
        send_uaz_buttons: () => handleSendUazButtons(args, ctx), // Substitui o listMenu
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

async function handleGetStoreInfo(ctx: ToolContext) {
    const db = createAdminClient();
    const { data, error } = await db
        .from("restaurants")
        .select("name, address, business_hours, description, logo_url, pix_key")
        .eq("id", ctx.restaurant_id)
        .single();

    if (error) {
        console.error("[TOOL: get_store_info] Erro no banco:", error.message);
        return { ok: false, error: error.message };
    }

    // Supondo que a loja está aberta se retornou dados, ou adicione lógica real aqui
    return { ok: true, store_info: { ...data, is_open_now: true } };
}

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

    const mappedProducts = (data || []).map((p: any) => ({
        product_id: p.id,
        title: p.nome,
        description: p.description || "Delicioso",
        price: p.preco_original || p.preco_promo || 0,
        promo_price: p.preco_promo || null,
        image_url: p.imagem_url || ""
    }));

    return { ok: true, products: mappedProducts };
}

async function handleCalculateCartTotal(args: Record<string, unknown>, ctx: ToolContext) {
    const db = createAdminClient();
    const items = args.items as any[] || [];
    let subtotal = 0;

    // ⚡ PERFORMANCE: Busca todos os produtos de uma vez (Batch Query)
    const productIds = items.map(i => i.product_id).filter(Boolean);

    if (productIds.length > 0) {
        const { data: products } = await db
            .from("produtos_promo")
            .select("id, preco_promo, preco_original")
            .in("id", productIds);

        if (products) {
            const productPriceMap: Record<string, number> = {};
            products.forEach(p => {
                productPriceMap[p.id] = p.preco_promo || p.preco_original || 0;
            });

            for (const item of items) {
                const price = productPriceMap[item.product_id] || 0;
                subtotal += (price * item.quantity);
            }
        }
    }

    // 🗺️ LÓGICA GOOGLE MAPS PARA FRETE
    let delivery_fee = 0;
    let distance_km = 0;

    const { data: restaurant } = await db
        .from("restaurants")
        .select("delivery_price_per_km, store_address")
        .eq("id", ctx.restaurant_id)
        .single();

    if (args.customer_address && restaurant?.store_address && process.env.GOOGLE_MAPS_API_KEY) {
        try {
            const origin = encodeURIComponent(restaurant.store_address);
            const dest = encodeURIComponent(args.customer_address as string);
            const gmRes = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${dest}&key=${process.env.GOOGLE_MAPS_API_KEY}`);
            const gmData = await gmRes.json();
            
            if (gmData.status === "OK" && gmData.rows[0].elements[0].status === "OK") {
                const distanceMeters = gmData.rows[0].elements[0].distance.value;
                distance_km = distanceMeters / 1000;
                const pricePerKm = Number(restaurant.delivery_price_per_km) || 2; 
                delivery_fee = Number((distance_km * pricePerKm).toFixed(2));
            }
        } catch (e) {
            console.error("[MAPS_ERROR]", e);
            delivery_fee = 5; // Valor de fallback caso Google Maps falhe
        }
    } else {
        delivery_fee = 5; // Fallback se faltar endereço ou API key
    }

    const discount = 0; // Cupom futuro aqui
    const total = subtotal + delivery_fee - discount;

    return {
        ok: true,
        subtotal,
        delivery_fee,
        distance_km,
        discount,
        total,
        items_processed: items.length
    };
}

async function handleSubmitFinalOrder(
    args: Record<string, unknown>,
    ctx: ToolContext
) {
    const db = createAdminClient();

    if (!args.address_number) return { ok: false, error: "MISSING_ADDRESS_NUMBER", ai_instruction: "Pergunte o número da casa." };
    if (!args.payment_method) return { ok: false, error: "MISSING_PAYMENT_METHOD", ai_instruction: "Pergunte a forma de pagamento." };
    if (!args.gps_location) return { ok: false, error: "MISSING_GPS_LOCATION", ai_instruction: "Você precisa da localização GPS do cliente antes de finalizar." };
    if (!args.items || !Array.isArray(args.items) || args.items.length === 0) return { ok: false, error: "MISSING_ITEMS" };
    if (args.subtotal === undefined || args.total === undefined) return { ok: false, error: "MISSING_TOTALS", ai_instruction: "Chame calculate_cart_total primeiro." };
    if (args.payment_method === "dinheiro" && args.change_for === undefined) {
        return { ok: false, error: "MISSING_CHANGE_FOR", ai_instruction: "Pergunte: Precisa de troco para quanto?" };
    }

    const chatId = (args.chat_id as string) || ctx.chat_id;

    // 🛡️ SECURITY: recalculate prices to avoid prompt injection 🛡️
    const productIds = (args.items as any[]).map(i => i.product_id).filter(Boolean);
    let realSubtotal = 0;

    if (productIds.length > 0) {
        const { data: products } = await db
            .from("produtos_promo")
            .select("id, preco_promo, preco_original")
            .in("id", productIds);

        if (products) {
            const productPriceMap: Record<string, number> = {};
            products.forEach(p => {
                productPriceMap[p.id] = p.preco_promo || p.preco_original || 0;
            });
            for (const item of (args.items as any[])) {
                const price = productPriceMap[item.product_id] || 0;
                realSubtotal += (price * item.quantity);
            }
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

async function handleGetPixPayment(
    args: Record<string, unknown>,
    ctx: ToolContext
) {
    const db = createAdminClient();
    const amount = Number(args.amount);

    if (!amount || amount <= 0) return { ok: false, error: "MISSING_AMOUNT" };

    const { data: restaurant } = await db
        .from("restaurants")
        .select("name, pix_key")
        .eq("id", ctx.restaurant_id)
        .single();

    if (!restaurant?.pix_key) {
        return { ok: false, error: "PIX_KEY_NOT_CONFIGURED", ai_instruction: "No PIX key is configured for this store." };
    }

    const cleanNumber = ctx.wa_chat_id?.split('@')[0].replace(/\D/g, "");

    return {
        ok: true,
        uazapi_payload: {
            number: cleanNumber,
            amount: Number(amount.toFixed(2)),
            text: `Pedido #${Math.floor(Math.random() * 1000)} pronto para pagamento`,
            pixKey: restaurant.pix_key,
            pixType: "EVP", 
            pixName: restaurant.name || "Loja"
        }
    };
}

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

// 🛒 CARROSSEL UAZAPI FORMATO CORRETO E COM PREÇO RISCADO
async function handleSendUazCarousel(
    args: Record<string, unknown>,
    ctx: ToolContext
) {
    const products = (args.products as any[]) || [];
    const cleanNumber = ctx.wa_chat_id?.split('@')[0].replace(/\D/g, "");

    const cards = products.map((p: any) => {
        const hasPromo = p.promo_price && p.promo_price < p.price;
        const priceText = hasPromo
            ? `De ~R$ ${Number(p.price).toFixed(2)}~ por *R$ ${Number(p.promo_price).toFixed(2)}*`
            : `*R$ ${Number(p.price).toFixed(2)}*`;

        return {
            text: `*${p.title}*\n\n${p.description}\n\n${priceText}`,
            image: p.image_url || "",
            buttons: [
                {
                    id: `add_${p.product_id}`,
                    text: "🛒 Adicionar",
                    type: "REPLY"
                }
            ]
        };
    });

    return {
        ok: true,
        uazapi_payload: {
            number: cleanNumber,
            text: args.text || "Confira nosso cardápio:",
            carousel: cards,
            delay: 1000,
            readchat: true
        }
    };
}

// 🎯 BOTÕES NATIVOS UAZAPI FORMATO CORRETO
async function handleSendUazButtons(
    args: Record<string, unknown>,
    ctx: ToolContext
) {
    const cleanNumber = ctx.wa_chat_id?.split('@')[0].replace(/\D/g, "");
    
    return {
        ok: true,
        uazapi_payload: {
            number: cleanNumber,
            type: "button",
            text: args.text || "Selecione uma opção:",
            choices: args.choices || [],
            footerText: args.footerText || "Escolha uma das opções abaixo"
        }
    };
}

// 📍 PEDIDO DE LOCALIZAÇÃO NATIVO UAZAPI
async function handleRequestUserLocation(ctx: ToolContext) {
    const cleanNumber = ctx.wa_chat_id?.split('@')[0].replace(/\D/g, "");

    return {
        ok: true,
        uazapi_payload: {
            number: cleanNumber,
            text: "Por favor, compartilhe sua localização usando o clipe (anexo) do WhatsApp para calcularmos a distância exata da entrega.",
            delay: 0,
            readchat: true,
            readmessages: true
        }
    };
}

async function handleMoveKanbanStage(
    args: Record<string, unknown>,
    ctx: ToolContext
) {
    const db = createAdminClient();
    const chatId = (args.chat_id as string) || ctx.chat_id;
    const stageName = args.stage_name as string;

    if (!chatId || !stageName) return { ok: false, error: "MISSING_ARGS" };

    const { data: stage, error: stageError } = await db
        .from("kanban_stages")
        .select("id")
        .eq("restaurant_id", ctx.restaurant_id)
        .eq("name", stageName)
        .maybeSingle();

    if (stageError || !stage) return { ok: false, error: "STAGE_NOT_FOUND" };

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
