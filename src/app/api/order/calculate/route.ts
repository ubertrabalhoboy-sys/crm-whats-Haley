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
    const { items, cupom_code, customer_address } = body as {
        items: Array<{ product_id: string; quantity: number }>;
        cupom_code?: string;
        customer_address?: string;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ ok: false, error: "ITEMS_REQUIRED" }, { status: 400 });
    }

    // 1. Fetch products
    const productIds = items.map((i) => i.product_id);
    const { data: products, error: prodError } = await supabase
        .from("produtos_promo")
        .select("id, nome, preco_promo, preco_original")
        .in("id", productIds)
        .eq("restaurant_id", profile.restaurant_id);

    if (prodError || !products) {
        return NextResponse.json({ ok: false, error: "PRODUCTS_FETCH_FAILED" }, { status: 500 });
    }

    // 2. Calculate subtotal
    let subtotal = 0;
    const lineItems: Array<{ name: string; qty: number; unit_price: number; total: number }> = [];

    for (const item of items) {
        const product = products.find((p) => p.id === item.product_id);
        if (!product) continue;

        const price = Number(product.preco_promo) || Number(product.preco_original) || 0;
        const lineTotal = price * item.quantity;
        subtotal += lineTotal;
        lineItems.push({
            name: product.nome,
            qty: item.quantity,
            unit_price: price,
            total: lineTotal,
        });
    }

    // 3. Apply coupon discount
    let discount = 0;
    if (cupom_code) {
        // Parse coupon: "10OFF" → 10%, "20OFF" → 20%, etc.
        const match = cupom_code.match(/(\d+)/);
        if (match) {
            const pct = Math.min(Number(match[1]), 100);
            discount = subtotal * (pct / 100);
        }
    }

    // 4. Calculate delivery fee
    let delivery_fee = 0;
    const { data: restaurant } = await supabase
        .from("restaurants")
        .select("delivery_price_per_km, free_delivery_threshold, store_address")
        .eq("id", profile.restaurant_id)
        .single();

    if (restaurant) {
        const threshold = Number(restaurant.free_delivery_threshold) || 0;
        const pricePerKm = Number(restaurant.delivery_price_per_km) || 0;
        const afterDiscount = subtotal - discount;

        if (threshold > 0 && afterDiscount >= threshold) {
            delivery_fee = 0; // Free delivery
        } else if (customer_address && pricePerKm > 0) {
            // Simplified: Estimate 5km as default distance (Distance Matrix API integration later)
            const estimatedKm = 5;
            delivery_fee = estimatedKm * pricePerKm;
        }
    }

    const total = subtotal - discount + delivery_fee;

    return NextResponse.json({
        ok: true,
        calculation: {
            line_items: lineItems,
            subtotal: Number(subtotal.toFixed(2)),
            discount: Number(discount.toFixed(2)),
            cupom_applied: cupom_code || null,
            delivery_fee: Number(delivery_fee.toFixed(2)),
            free_delivery: delivery_fee === 0 && (Number(restaurant?.free_delivery_threshold) || 0) > 0,
            total: Number(total.toFixed(2)),
        },
    });
}
