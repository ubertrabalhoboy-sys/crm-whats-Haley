import assert from "node:assert/strict";
import {
    detectRouletteChoiceIntent,
    detectStructuredReplyIntent,
    detectUnverifiedCommercialClaim,
    isRoulettePrizeTrigger,
    normalizeOutboundText,
    parseAddToCartClientAction,
    shouldHandleDelayedCouponDeferral,
    stripThoughtBlocks,
} from "../src/lib/ai/orchestratorRules.ts";

assert.equal(
    stripThoughtBlocks("Oi<thought>segredo</thought> tudo bem"),
    "Oi tudo bem"
);

assert.equal(
    stripThoughtBlocks("```thinking\nnao mostrar\n```\nResposta final"),
    "Resposta final"
);

const normalizedWithPlaceholders = normalizeOutboundText(
    "Ola, eu sou da {nome_restaurante}. Status {kanban_status}. Cupom: {cupom_ganho}",
    {
        restaurantName: "FoodSpin",
        kanbanStatus: "Em atendimento",
        cupomGanho: "GANHE10",
    }
);
assert.deepEqual(normalizedWithPlaceholders, {
    ok: true,
    text: "Ola, eu sou da FoodSpin. Status Em atendimento. Cupom: GANHE10",
});

assert.deepEqual(
    normalizeOutboundText('{"ok":true,"uazapi_payload":{}}', {
        restaurantName: "FoodSpin",
        kanbanStatus: "Em atendimento",
        cupomGanho: "GANHE10",
    }),
    { ok: false, reason: "RAW_TOOL_PAYLOAD_DETECTED" }
);

assert.deepEqual(
    normalizeOutboundText("<thinking>nao mostrar</thinking>", {
        restaurantName: "FoodSpin",
        kanbanStatus: "Em atendimento",
        cupomGanho: "GANHE10",
    }),
    { ok: false, reason: "EMPTY_TEXT_AFTER_NORMALIZATION" }
);

assert.deepEqual(
    detectUnverifiedCommercialClaim(
        "Seu frete ficou em R$ 8,50",
        { hasFreightCalculation: false, hasPixQuote: false }
    ),
    {
        risky: true,
        reason: "UNVERIFIED_FREIGHT_VALUE",
        safeFallbackText: "Vou confirmar o valor exato do frete no sistema antes de te passar.",
    }
);

assert.deepEqual(
    detectUnverifiedCommercialClaim(
        "O pagamento via PIX ficou em R$ 42,00",
        { hasFreightCalculation: true, hasPixQuote: false }
    ),
    {
        risky: true,
        reason: "UNVERIFIED_PIX_VALUE",
        safeFallbackText: "Vou confirmar o valor certinho do pagamento antes de seguir.",
    }
);

assert.deepEqual(
    detectUnverifiedCommercialClaim(
        "O pagamento via PIX ficou em R$ 42,00",
        { hasFreightCalculation: true, hasPixQuote: true }
    ),
    { risky: false }
);

assert.deepEqual(
    detectUnverifiedCommercialClaim(
        "Posso confirmar o pagamento para seguir?",
        { hasFreightCalculation: false, hasPixQuote: false }
    ),
    { risky: false }
);

assert.equal(
    shouldHandleDelayedCouponDeferral({
        latestInboundText: "pode ser",
        latestOutboundText:
            "A loja esta fechada agora, mas seu cupom esta garantido. Voce prefere usar outro dia?",
        hasCartItems: false,
    }),
    true
);

assert.equal(
    shouldHandleDelayedCouponDeferral({
        latestInboundText: "pode ser",
        latestOutboundText: "Confira nossas opcoes de lanche",
        hasCartItems: false,
    }),
    false
);

assert.equal(
    shouldHandleDelayedCouponDeferral({
        latestInboundText: "sim",
        latestOutboundText:
            "A loja esta fechada agora, mas seu cupom esta garantido. Voce prefere usar outro dia?",
        hasCartItems: true,
    }),
    false
);

assert.deepEqual(
    detectStructuredReplyIntent({
        text: "Perfeito. Agora clique no botao abaixo e compartilhe sua localizacao para eu seguir.",
        hasCartItems: true,
        locationConfirmed: false,
        addressConfirmed: false,
        referenceConfirmed: false,
        hasFreightCalculation: false,
        hasPaymentMethod: false,
    }),
    { kind: "request_location" }
);

assert.deepEqual(
    detectStructuredReplyIntent({
        text: "Me manda seu endereco para eu seguir.",
        hasCartItems: true,
        locationConfirmed: false,
        addressConfirmed: false,
        referenceConfirmed: false,
        hasFreightCalculation: false,
        hasPaymentMethod: false,
    }),
    { kind: "request_location" }
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
    }),
    { kind: "payment_buttons" }
);

assert.equal(
    detectStructuredReplyIntent({
        text: "Me manda o numero da casa",
        hasCartItems: true,
        locationConfirmed: true,
        addressConfirmed: false,
        referenceConfirmed: false,
        hasFreightCalculation: false,
        hasPaymentMethod: false,
    }),
    null
);

assert.deepEqual(
    detectStructuredReplyIntent({
        text: "Opa, vou ver aqui. Qual categoria do cardapio voce quer ver primeiro? Principal, adicional ou bebida?",
        hasCartItems: false,
        locationConfirmed: false,
        addressConfirmed: false,
        referenceConfirmed: false,
        hasFreightCalculation: false,
        hasPaymentMethod: false,
        hasPrincipal: false,
        hasAdditional: false,
        hasDrink: false,
        hasOrder: false,
    }),
    { kind: "category_catalog", category: "principal" }
);

assert.deepEqual(
    detectStructuredReplyIntent({
        text: "Que tal um adicional pra acompanhar? Temos umas opcoes bem boas.",
        hasCartItems: true,
        locationConfirmed: false,
        addressConfirmed: false,
        referenceConfirmed: false,
        hasFreightCalculation: false,
        hasPaymentMethod: false,
        hasPrincipal: true,
        hasAdditional: false,
        hasDrink: false,
        hasOrder: false,
    }),
    { kind: "category_catalog", category: "adicional" }
);

assert.deepEqual(
    detectStructuredReplyIntent({
        text: "Confira nossas opcoes:",
        hasCartItems: true,
        locationConfirmed: false,
        addressConfirmed: false,
        referenceConfirmed: false,
        hasFreightCalculation: false,
        hasPaymentMethod: false,
        hasPrincipal: true,
        hasAdditional: true,
        hasDrink: false,
        hasOrder: false,
    }),
    { kind: "category_catalog", category: "bebida" }
);

assert.deepEqual(
    detectStructuredReplyIntent({
        text: "Pra fechar, que tal uma bebida pra acompanhar? Temos varias opcoes de refrigerantes e sucos.",
        hasCartItems: true,
        locationConfirmed: false,
        addressConfirmed: false,
        referenceConfirmed: false,
        hasFreightCalculation: false,
        hasPaymentMethod: false,
        hasPrincipal: true,
        hasAdditional: true,
        hasDrink: false,
        hasOrder: false,
    }),
    { kind: "category_catalog", category: "bebida" }
);

assert.equal(
    isRoulettePrizeTrigger("🎰 Roleta: 20%OFF"),
    true
);

assert.equal(
    detectRouletteChoiceIntent({
        latestInboundText: "Agora ja 18h",
        latestOutboundText: "Parabens! Quer usar agora ou outro dia?",
        hasCartItems: false,
    }),
    "use_now"
);

assert.equal(
    detectRouletteChoiceIntent({
        latestInboundText: "Mais tarde depois que a loja abrir",
        latestOutboundText: "Parabens! Quer usar agora ou outro dia?",
        hasCartItems: false,
    }),
    "use_later"
);

assert.deepEqual(
    parseAddToCartClientAction(
        'CLIENT_ACTION:add_to_cart product_id=11111111-1111-1111-1111-111111111111 product_name="Bacon Monster" category=principal'
    ),
    {
        productId: "11111111-1111-1111-1111-111111111111",
        productName: "Bacon Monster",
        category: "principal",
    }
);

console.log("AI orchestrator rules smoke tests passed");
