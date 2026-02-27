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
    const { chat_id, amount } = body as { chat_id: string; amount: number };

    if (!chat_id || typeof amount !== "number" || amount <= 0) {
        return NextResponse.json({ ok: false, error: "MISSING_CHAT_ID_OR_AMOUNT" }, { status: 400 });
    }

    // 1. Get restaurant PIX key and name
    const { data: restaurant, error: restError } = await supabase
        .from("restaurants")
        .select("name, pix_key")
        .eq("id", profile.restaurant_id)
        .single();

    if (restError || !restaurant) {
        return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_FOUND" }, { status: 404 });
    }

    if (!restaurant.pix_key) {
        return NextResponse.json({ ok: false, error: "PIX_KEY_NOT_CONFIGURED" }, { status: 422 });
    }

    // 2. Get the chat's WhatsApp ID for sending
    const { data: chat } = await supabase
        .from("chats")
        .select("wa_chat_id")
        .eq("id", chat_id)
        .eq("restaurant_id", profile.restaurant_id)
        .single();

    if (!chat) {
        return NextResponse.json({ ok: false, error: "CHAT_NOT_FOUND" }, { status: 404 });
    }

    // 3. Format the Uazapi PIX payment request payload
    const pixPayload = {
        phone: chat.wa_chat_id,
        pix: {
            key: restaurant.pix_key,
            name: restaurant.name || "Loja",
            amount: Number(amount.toFixed(2)),
            description: `Pedido via ${restaurant.name || "FoodSpin"}`,
        },
        message: `💰 *Pagamento PIX*\n\nValor: R$ ${amount.toFixed(2)}\nEstabelecimento: ${restaurant.name}\n\n✅ Após o pagamento, envie o comprovante aqui!`,
    };

    return NextResponse.json({
        ok: true,
        pix_payload: pixPayload,
    });
}
