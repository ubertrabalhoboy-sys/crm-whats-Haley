import assert from "node:assert/strict";
import {
    determineRecommendedCommercialObjective,
    readCartSnapshotMeta,
} from "../src/lib/ai/heuristics.ts";
import {
    detectStructuredReplyIntent,
    detectUnverifiedCommercialClaim,
} from "../src/lib/ai/orchestratorRules.ts";
import { buildCartSnapshotData } from "../src/lib/ai/toolRules.ts";

const cartSnapshot = buildCartSnapshotData({
    items: [
        { product_id: "p1", quantity: 1, category: "principal" },
        { product_id: "a1", quantity: 1, category: "adicional" },
        { product_id: "b1", quantity: 1, category: "bebida" },
    ],
    subtotal: 58,
    discount: 8,
    delivery_fee: 6,
    total: 56,
    source: "calculate_cart_total",
    updated_at: "2026-03-05T00:00:00.000Z",
});

const cartMeta = readCartSnapshotMeta(cartSnapshot);

assert.equal(cartMeta.hasItems, true);
assert.equal(cartMeta.hasPrincipal, true);
assert.equal(cartMeta.hasAdditional, true);
assert.equal(cartMeta.hasDrink, true);

assert.equal(
    determineRecommendedCommercialObjective({
        pendingSteps: [],
        commercialPhase: "pagamento",
        resumptionSignal: "continuidade_normal",
        dominantCustomerIntent: "fechamento_operacional",
        cartSnapshotMeta: cartMeta,
        salesSignals: {
            offeredAdditional: true,
            offeredDrink: true,
            closeAttemptStarted: true,
            customerRejectedOffer: false,
        },
    }),
    "coletar_dados_finais_e_avancar_fechamento"
);

assert.deepEqual(
    detectStructuredReplyIntent({
        text: "Perfeito. Agora compartilhe sua localizacao para eu seguir.",
        hasCartItems: true,
        locationConfirmed: false,
        addressConfirmed: false,
        referenceConfirmed: false,
        hasFreightCalculation: false,
        hasPaymentMethod: false,
        hasPrincipal: true,
        hasAdditional: true,
        hasDrink: true,
        hasOrder: false,
    }),
    { kind: "request_location" }
);

assert.equal(
    detectStructuredReplyIntent({
        text: "Como prefere pagar? PIX, Dinheiro ou Cartao?",
        hasCartItems: true,
        locationConfirmed: true,
        addressConfirmed: true,
        referenceConfirmed: true,
        hasFreightCalculation: false,
        hasPaymentMethod: false,
        hasPrincipal: true,
        hasAdditional: true,
        hasDrink: true,
        hasOrder: false,
    }),
    null
);

assert.deepEqual(
    detectStructuredReplyIntent({
        text: "Como prefere pagar? PIX, Dinheiro ou Cartao?",
        hasCartItems: true,
        locationConfirmed: true,
        addressConfirmed: true,
        referenceConfirmed: true,
        hasFreightCalculation: true,
        hasPaymentMethod: false,
        hasPrincipal: true,
        hasAdditional: true,
        hasDrink: true,
        hasOrder: false,
    }),
    { kind: "payment_buttons" }
);

assert.deepEqual(
    detectUnverifiedCommercialClaim("Seu pagamento via PIX ficou em R$ 56,00.", {
        hasFreightCalculation: true,
        hasPixQuote: false,
    }),
    {
        risky: true,
        reason: "UNVERIFIED_PIX_VALUE",
        safeFallbackText:
            "Vou confirmar o valor certinho do pagamento antes de seguir.",
    }
);

assert.deepEqual(
    detectUnverifiedCommercialClaim("Seu pagamento via PIX ficou em R$ 56,00.", {
        hasFreightCalculation: true,
        hasPixQuote: true,
    }),
    { risky: false }
);

const paidSnapshot = buildCartSnapshotData({
    items: cartSnapshot.items,
    subtotal: 58,
    discount: 8,
    delivery_fee: 6,
    total: 56,
    payment_method: "pix",
    source: "calculate_cart_total",
    updated_at: "2026-03-05T00:01:00.000Z",
});

const paidObjective = determineRecommendedCommercialObjective({
    pendingSteps: [],
    commercialPhase: "pagamento",
    resumptionSignal: "continuidade_normal",
    dominantCustomerIntent: "fechamento_operacional",
    cartSnapshotMeta: readCartSnapshotMeta(paidSnapshot),
    salesSignals: {
        offeredAdditional: true,
        offeredDrink: true,
        closeAttemptStarted: true,
        customerRejectedOffer: false,
    },
});

assert.equal(
    ["coletar_dados_finais_e_avancar_fechamento", "fechar_pedido"].includes(paidObjective),
    true
);

console.log("AI E2E checkout flow contract tests passed");
