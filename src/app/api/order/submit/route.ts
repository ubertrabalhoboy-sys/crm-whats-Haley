import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const { data: profile } = await supabase
        .from("profiles")
        .select("restaurant_id")
        .eq("id", user.id)
        .maybeSingle();

    if (!profile?.restaurant_id) {
        return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 });
    }

    const body = await req.json();
    const {
        chat_id,
        items,
        subtotal,
        discount,
        delivery_fee,
        total,
        payment_method,
        change_for,
        address_number,
        address_reference,
        gps_location,
    } = body;

    // --- Validation Layer (AI-friendly error messages) ---

    if (!chat_id) {
        return NextResponse.json({
            ok: false,
            error: "MISSING_CHAT_ID",
            ai_instruction: "Internal error: chat_id is missing from the order context.",
        }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({
            ok: false,
            error: "MISSING_ITEMS",
            ai_instruction: "The order has no items. Ask the user what they would like to order.",
        }, { status: 400 });
    }

    if (!payment_method) {
        return NextResponse.json({
            ok: false,
            error: "MISSING_PAYMENT_METHOD",
            ai_instruction: "Ask the user for the payment method: PIX, Dinheiro, or Cartão.",
        }, { status: 400 });
    }

    if (!address_number) {
        return NextResponse.json({
            ok: false,
            error: "MISSING_ADDRESS_NUMBER",
            ai_instruction: "Ask the user for the house number.",
        }, { status: 400 });
    }

    if (payment_method === "dinheiro" && (change_for === undefined || change_for === null)) {
        return NextResponse.json({
            ok: false,
            error: "MISSING_CHANGE_FOR",
            ai_instruction: "The user selected cash payment. Ask: 'Precisa de troco para quanto?'",
        }, { status: 400 });
    }

    // --- Insert the order ---
    const { data: order, error: insertError } = await supabase
        .from("orders")
        .insert({
            restaurant_id: profile.restaurant_id,
            chat_id,
            items,
            subtotal: subtotal || 0,
            discount: discount || 0,
            delivery_fee: delivery_fee || 0,
            total: total || 0,
            payment_method,
            change_for: change_for || null,
            address_number,
            address_reference: address_reference || null,
            gps_location: gps_location || null,
            status: "received",
        })
        .select()
        .single();

    if (insertError) {
        return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    // --- Dispatch ORDER_CREATED webhook (fire-and-forget) ---
    // This allows integration with PrintNode, POS systems, or any external webhook.
    const webhookPayload = {
        event: "ORDER_CREATED",
        order_id: order.id,
        restaurant_id: profile.restaurant_id,
        data: order,
        timestamp: new Date().toISOString(),
    };

    // Log the event in webhook_logs for audit trail
    await supabase.from("webhook_logs").insert({
        restaurant_id: profile.restaurant_id,
        chat_id,
        tag_disparada: "ORDER_CREATED",
        status: "dispatched",
    }).then(() => {/* Fire-and-forget */ });

    // If a webhook URL is configured, dispatch it asynchronously
    // Future: read from restaurant settings. For now, log only.
    console.log("[ORDER_CREATED] Webhook payload:", JSON.stringify(webhookPayload));

    return NextResponse.json({
        ok: true,
        order_id: order.id,
        message: "Pedido registrado com sucesso.",
        webhook_dispatched: true,
    });
}
