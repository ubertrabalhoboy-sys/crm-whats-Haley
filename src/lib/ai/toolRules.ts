export type ToolCartItem = {
    product_id?: string;
    quantity: number;
    category?: string;
};

export type CartSnapshotSource = "calculate_cart_total" | "submit_final_order";

export type CartSnapshotData = {
    items: ToolCartItem[];
    subtotal: number;
    discount: number;
    delivery_fee: number;
    distance_km?: number;
    total: number;
    applied_coupon_code?: string | null;
    payment_method?: string | null;
    order_id?: string | null;
    source: CartSnapshotSource;
    updated_at: string;
};

function toMoney(value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }

    return Number(numeric.toFixed(2));
}

export function calculateCouponDiscount(subtotal: number, cupomCode: unknown) {
    if (typeof cupomCode !== "string" || !cupomCode.trim()) {
        return 0;
    }

    const match = cupomCode.match(/(\d+)/);
    if (!match) {
        return 0;
    }

    const percentage = Math.min(Number(match[1]), 100);
    return subtotal * (percentage / 100);
}

export function resolveAppliedDiscount(
    subtotal: number,
    explicitDiscount: unknown,
    activeCouponCode: string
) {
    const explicit = toMoney(explicitDiscount);
    if (explicit > 0) {
        return explicit;
    }

    return toMoney(calculateCouponDiscount(subtotal, activeCouponCode));
}

export function buildCarouselPriceText(details: {
    price: number;
    promoPrice: number | null;
    activeCouponCode: string;
}) {
    const normalizedPrice = toMoney(details.price);
    const normalizedPromoPrice =
        details.promoPrice == null ? null : toMoney(details.promoPrice);
    const hasPromo =
        normalizedPromoPrice != null &&
        normalizedPromoPrice > 0 &&
        normalizedPromoPrice < normalizedPrice;
    const baseDisplayPrice = hasPromo ? normalizedPromoPrice : normalizedPrice;
    const couponDiscount = calculateCouponDiscount(baseDisplayPrice, details.activeCouponCode);
    const couponAdjustedPrice = toMoney(Math.max(baseDisplayPrice - couponDiscount, 0));
    const hasCouponDisplay =
        details.activeCouponCode.trim().length > 0 &&
        couponAdjustedPrice > 0 &&
        couponAdjustedPrice < baseDisplayPrice;

    if (hasCouponDisplay && hasPromo && normalizedPromoPrice != null) {
        return `De ~R$ ${normalizedPrice.toFixed(2)}~ por *R$ ${normalizedPromoPrice.toFixed(2)}*\nCom seu cupom: *R$ ${couponAdjustedPrice.toFixed(2)}*`;
    }

    if (hasCouponDisplay) {
        return `De ~R$ ${normalizedPrice.toFixed(2)}~ por *R$ ${couponAdjustedPrice.toFixed(2)}* com seu cupom`;
    }

    if (hasPromo && normalizedPromoPrice != null) {
        return `De ~R$ ${normalizedPrice.toFixed(2)}~ por *R$ ${normalizedPromoPrice.toFixed(2)}*`;
    }

    return `*R$ ${normalizedPrice.toFixed(2)}*`;
}

export function buildCartSnapshotData(input: {
    items: ToolCartItem[];
    subtotal: number;
    discount: number;
    delivery_fee: number;
    distance_km?: number;
    total: number;
    applied_coupon_code?: string | null;
    payment_method?: string | null;
    order_id?: string | null;
    source: CartSnapshotSource;
    updated_at: string;
}): CartSnapshotData {
    return {
        items: input.items,
        subtotal: toMoney(input.subtotal),
        discount: toMoney(input.discount),
        delivery_fee: toMoney(input.delivery_fee),
        distance_km:
            input.distance_km == null ? undefined : toMoney(input.distance_km),
        total: toMoney(input.total),
        applied_coupon_code: input.applied_coupon_code || null,
        payment_method: input.payment_method || null,
        order_id: input.order_id || null,
        source: input.source,
        updated_at: input.updated_at,
    };
}
