import assert from "node:assert/strict";
import {
    determineRecommendedCommercialObjective,
    readCartSnapshotMeta,
} from "../src/lib/ai/heuristics.ts";
import {
    buildCartSnapshotData,
    buildCarouselPriceText,
    resolveAppliedDiscount,
} from "../src/lib/ai/toolRules.ts";

function makeSignals(overrides = {}) {
    return {
        offeredAdditional: false,
        offeredDrink: false,
        closeAttemptStarted: false,
        customerRejectedOffer: false,
        ...overrides,
    };
}

function makeObjectiveInput(overrides = {}) {
    return {
        pendingSteps: [],
        commercialPhase: "atendimento_ativo",
        resumptionSignal: "continuidade_normal",
        dominantCustomerIntent: "indefinida",
        cartSnapshotMeta: readCartSnapshotMeta(null),
        salesSignals: makeSignals(),
        ...overrides,
    };
}

const principalSnapshot = buildCartSnapshotData({
    items: [{ product_id: "p1", quantity: 1, category: "principal" }],
    subtotal: 32,
    discount: resolveAppliedDiscount(32, 0, "GANHE10"),
    delivery_fee: 0,
    total: 28.8,
    applied_coupon_code: "GANHE10",
    source: "calculate_cart_total",
    updated_at: "2026-03-02T01:00:00.000Z",
});

const principalMeta = readCartSnapshotMeta(principalSnapshot);
assert.equal(principalMeta.hasPrincipal, true);
assert.equal(principalMeta.discount, 3.2);
assert.equal(
    determineRecommendedCommercialObjective(
        makeObjectiveInput({
            cartSnapshotMeta: principalMeta,
        })
    ),
    "oferecer_adicional"
);

const principalAndAdditionalSnapshot = buildCartSnapshotData({
    items: [
        { product_id: "p1", quantity: 1, category: "principal" },
        { product_id: "a1", quantity: 1, category: "adicional" },
    ],
    subtotal: 40,
    discount: resolveAppliedDiscount(40, 0, ""),
    delivery_fee: 0,
    total: 40,
    source: "calculate_cart_total",
    updated_at: "2026-03-02T01:05:00.000Z",
});

const principalAndAdditionalMeta = readCartSnapshotMeta(principalAndAdditionalSnapshot);
assert.equal(
    determineRecommendedCommercialObjective(
        makeObjectiveInput({
            cartSnapshotMeta: principalAndAdditionalMeta,
        })
    ),
    "oferecer_bebida"
);

const fullCartWithPaymentSnapshot = buildCartSnapshotData({
    items: [
        { product_id: "p1", quantity: 1, category: "principal" },
        { product_id: "a1", quantity: 1, category: "adicional" },
        { product_id: "b1", quantity: 1, category: "bebida" },
    ],
    subtotal: 52,
    discount: resolveAppliedDiscount(52, 5, "GANHE10"),
    delivery_fee: 8,
    total: 55,
    payment_method: "pix",
    source: "calculate_cart_total",
    updated_at: "2026-03-02T01:10:00.000Z",
});

const fullCartWithPaymentMeta = readCartSnapshotMeta(fullCartWithPaymentSnapshot);
assert.equal(fullCartWithPaymentMeta.hasDrink, true);
assert.equal(fullCartWithPaymentMeta.hasPaymentMethod, true);
assert.equal(
    determineRecommendedCommercialObjective(
        makeObjectiveInput({
            cartSnapshotMeta: fullCartWithPaymentMeta,
        })
    ),
    "fechar_pedido"
);

const orderedSnapshot = buildCartSnapshotData({
    items: [
        { product_id: "p1", quantity: 1, category: "principal" },
        { product_id: "a1", quantity: 1, category: "adicional" },
        { product_id: "b1", quantity: 1, category: "bebida" },
    ],
    subtotal: 52,
    discount: 5,
    delivery_fee: 8,
    total: 55,
    payment_method: "pix",
    order_id: "ord-123",
    source: "submit_final_order",
    updated_at: "2026-03-02T01:12:00.000Z",
});

const orderedMeta = readCartSnapshotMeta(orderedSnapshot);
assert.equal(orderedMeta.hasOrder, true);
assert.equal(
    determineRecommendedCommercialObjective(
        makeObjectiveInput({
            cartSnapshotMeta: orderedMeta,
        })
    ),
    "acompanhar_pos_fechamento_ou_confirmar_pagamento"
);

assert.equal(
    determineRecommendedCommercialObjective(
        makeObjectiveInput({
            cartSnapshotMeta: principalMeta,
            resumptionSignal: "retomada_carrinho",
        })
    ),
    "retomar_carrinho_e_conduzir_fechamento"
);

assert.equal(
    buildCarouselPriceText({
        price: 32,
        promoPrice: null,
        activeCouponCode: principalSnapshot.applied_coupon_code || "",
    }),
    "De ~R$ 32.00~ por *R$ 28.80* com seu cupom"
);

console.log("AI flow integration smoke tests passed");
