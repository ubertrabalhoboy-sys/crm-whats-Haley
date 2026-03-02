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

type FollowupCartSnapshot = {
    items?: Array<{ category?: unknown }>;
    payment_method?: unknown;
    order_id?: unknown;
};

type FollowupNextStep =
    | "principal"
    | "adicional"
    | "bebida"
    | "pagamento"
    | "fechamento"
    | "acompanhar"
    | "pedido";

function toMoney(value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }

    return Number(numeric.toFixed(2));
}

function asRecord(value: unknown) {
    if (typeof value === "object" && value !== null) {
        return value as Record<string, unknown>;
    }

    return null;
}

function readFollowupSnapshotMeta(snapshot: unknown) {
    const record = asRecord(snapshot) as FollowupCartSnapshot | null;
    const items = Array.isArray(record?.items) ? record.items : [];
    const categories = items
        .map((item) => {
            const itemRecord = asRecord(item);
            return typeof itemRecord?.category === "string"
                ? itemRecord.category.toLowerCase()
                : null;
        })
        .filter((value): value is string => Boolean(value));
    const paymentMethod =
        typeof record?.payment_method === "string" ? record.payment_method.trim() : "";
    const orderId = typeof record?.order_id === "string" ? record.order_id : "";

    return {
        hasItems: items.length > 0,
        hasPrincipal: categories.includes("principal"),
        hasAdditional: categories.includes("adicional"),
        hasDrink: categories.includes("bebida"),
        hasPaymentMethod: paymentMethod.length > 0,
        hasOrder: orderId.length > 0,
    };
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

export function inferFollowupNextStep(snapshot: unknown): FollowupNextStep {
    const meta = readFollowupSnapshotMeta(snapshot);

    if (meta.hasOrder) {
        return "acompanhar";
    }

    if (!meta.hasItems || !meta.hasPrincipal) {
        return "principal";
    }

    if (!meta.hasAdditional) {
        return "adicional";
    }

    if (!meta.hasDrink) {
        return "bebida";
    }

    if (!meta.hasPaymentMethod) {
        return "pagamento";
    }

    return "fechamento";
}

export function buildFollowupReminderText(details: {
    intent: string;
    cartSnapshot: unknown;
    kanbanStatus?: string | null;
    cupomGanho?: string | null;
    explicitText?: string | null;
}) {
    const explicitText =
        typeof details.explicitText === "string" ? details.explicitText.trim() : "";
    if (explicitText) {
        return explicitText;
    }

    const nextStep = inferFollowupNextStep(details.cartSnapshot);
    const hasCupom =
        typeof details.cupomGanho === "string" &&
        details.cupomGanho.trim().length > 0 &&
        details.cupomGanho.trim().toLowerCase() !== "nenhum";

    if (details.intent === "delayed_coupon") {
        if (nextStep === "principal" || nextStep === "pedido") {
            return hasCupom
                ? "Opa, a loja ja esta aberta e seu cupom segue ativo. Posso te ajudar a montar seu pedido agora?"
                : "Opa, a loja ja esta aberta. Posso te ajudar a montar seu pedido agora?";
        }

        if (nextStep === "adicional") {
            return "Opa, a loja ja esta aberta e seu pedido continua salvo. Posso continuar seu pedido e te mostrar os adicionais agora?";
        }

        if (nextStep === "bebida") {
            return "Opa, a loja ja esta aberta e seu pedido continua salvo. Posso continuar seu pedido e te mostrar as bebidas agora?";
        }

        if (nextStep === "pagamento" || nextStep === "fechamento") {
            return "Opa, a loja ja esta aberta e seu pedido continua salvo. Posso continuar seu pedido de onde paramos e seguir para o fechamento?";
        }

        return "Opa, a loja ja esta aberta e seu pedido continua salvo. Posso continuar seu pedido de onde paramos?";
    }

    if (details.intent === "abandoned_cart") {
        if (nextStep === "principal" || nextStep === "pedido") {
            return "Opa, estou retomando seu atendimento. Seu cupom ainda esta aqui e posso te ajudar a escolher seu pedido agora.";
        }

        if (nextStep === "pagamento" || nextStep === "fechamento") {
            return "Opa, estou retomando seu pedido. Seu carrinho continua salvo. Posso seguir de onde paramos e fechar com voce?";
        }

        return "Opa, estou retomando seu pedido e seu carrinho continua salvo. Posso continuar de onde paramos?";
    }

    if (details.kanbanStatus && details.kanbanStatus.toLowerCase().includes("agendamento")) {
        return "Opa, estou passando para retomar seu agendamento. Posso continuar seu pedido agora?";
    }

    return "Opa, estou passando para retomar seu atendimento. Posso continuar seu pedido de onde paramos?";
}

export function buildScheduledFollowupPayload(details: {
    existingPayload: unknown;
    intent: string;
    cartSnapshot: unknown;
    kanbanStatus?: string | null;
    cupomGanho?: string | null;
    generatedAt: string;
}) {
    const existingPayload = asRecord(details.existingPayload) || {};
    const existingResumeContext = asRecord(existingPayload.resume_context) || {};
    const explicitText =
        typeof existingPayload.text === "string" ? existingPayload.text.trim() : "";
    const reminderText = buildFollowupReminderText({
        intent: details.intent,
        cartSnapshot: details.cartSnapshot,
        kanbanStatus: details.kanbanStatus || "",
        cupomGanho: details.cupomGanho || "",
        explicitText,
    });

    return {
        ...existingPayload,
        text: reminderText,
        custom_text: explicitText || null,
        resume_context: {
            ...existingResumeContext,
            cart_snapshot: details.cartSnapshot ?? null,
            kanban_status: details.kanbanStatus || null,
            cupom_ganho: details.cupomGanho || null,
            next_step: inferFollowupNextStep(details.cartSnapshot),
            generated_at: details.generatedAt,
        },
    };
}
