import assert from "node:assert/strict";
import {
    buildActiveCategoryPitch,
    buildObjectionRecoveryPitch,
    buildPostAddToCartSalesPlan,
    detectSalesObjectionIntent,
    detectRouletteChoiceIntent,
    detectStructuredReplyIntent,
    detectUnverifiedCommercialClaim,
    inferSalesDomainFromProductName,
    isNeutralInboundWithoutCatalogIntent,
    isRoulettePrizeTrigger,
    normalizeOutboundText,
    parseAddToCartClientAction,
    resolveCategoryForPlaybook,
    shouldAutoCalculateAfterOperationalInput,
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

assert.equal(
    shouldAutoCalculateAfterOperationalInput({
        latestOutboundText:
            "Perfeito. Agora me manda um ponto de referencia para eu seguir.",
        receivedOperationalInput: true,
        hasCartItems: true,
        locationConfirmed: true,
        addressConfirmed: true,
        referenceConfirmed: true,
        hasPaymentMethod: false,
        hasOrder: false,
    }),
    true
);

assert.equal(
    shouldAutoCalculateAfterOperationalInput({
        latestOutboundText:
            "Perfeito. Agora me manda um ponto de referencia para eu seguir.",
        receivedOperationalInput: false,
        hasCartItems: true,
        locationConfirmed: true,
        addressConfirmed: true,
        referenceConfirmed: true,
        hasPaymentMethod: false,
        hasOrder: false,
    }),
    false
);

assert.equal(
    shouldAutoCalculateAfterOperationalInput({
        latestOutboundText: "Como prefere pagar?",
        receivedOperationalInput: true,
        hasCartItems: true,
        locationConfirmed: true,
        addressConfirmed: true,
        referenceConfirmed: true,
        hasPaymentMethod: false,
        hasOrder: false,
    }),
    false
);

assert.equal(
    isNeutralInboundWithoutCatalogIntent("oi"),
    true
);

assert.equal(
    isNeutralInboundWithoutCatalogIntent("quero ver os principais"),
    false
);

assert.equal(
    buildActiveCategoryPitch("principal", "20%OFF"),
    "Fechou! Seu 20%OFF ja entra no fechamento. Vou te mostrar nossos principais mais pedidos agora."
);

assert.equal(
    buildActiveCategoryPitch("adicional"),
    "Seu principal ja esta garantido. Agora vou te mostrar os adicionais que mais combinam com ele."
);

assert.equal(
    buildActiveCategoryPitch("bebida"),
    "Pedido forte desse jeito nao vai no seco. Agora vou te mostrar as bebidas que mais saem com ele."
);

assert.deepEqual(
    detectSalesObjectionIntent({
        latestInboundText: "so tem isso?",
        latestOutboundText: "Vou te mostrar nossos principais agora.",
        hasCartItems: false,
        hasPrincipal: false,
        hasAdditional: false,
        hasDrink: false,
        hasPaymentMethod: false,
        hasOrder: false,
    }),
    {
        category: "principal",
        isPriceObjection: false,
    }
);

assert.deepEqual(
    detectSalesObjectionIntent({
        latestInboundText: "ta caro",
        latestOutboundText: "Pra completar, ja te mostro as bebidas.",
        hasCartItems: true,
        hasPrincipal: true,
        hasAdditional: true,
        hasDrink: false,
        hasPaymentMethod: false,
        hasOrder: false,
    }),
    {
        category: "bebida",
        isPriceObjection: true,
    }
);

assert.deepEqual(
    detectSalesObjectionIntent({
        latestInboundText: "ta caro",
        latestOutboundText: "Pra completar, ja te mostro as bebidas.",
        hasCartItems: true,
        hasPrincipal: true,
        hasAdditional: true,
        hasDrink: false,
        hasPaymentMethod: false,
        hasOrder: false,
        preferredDomain: "acai",
        availability: { principal: true, adicional: true, bebida: false },
    }),
    {
        category: "principal",
        isPriceObjection: true,
    }
);

assert.equal(
    buildObjectionRecoveryPitch({
        category: "principal",
        isPriceObjection: true,
        cupomGanho: "20%OFF",
    }),
    "Fechou, vou te mostrar principais mais em conta agora. Seu 20%OFF segue ativo no fechamento."
);

assert.equal(
    buildObjectionRecoveryPitch({
        category: "adicional",
        isPriceObjection: false,
        cupomGanho: "Nenhum",
    }),
    "Tem sim. Vou abrir mais opcoes de adicionais que combinam com seu pedido."
);

assert.equal(
    inferSalesDomainFromProductName("Pizza Calabresa"),
    "pizza"
);

assert.equal(
    inferSalesDomainFromProductName("Acai Tradicional 500ml"),
    "acai"
);

assert.deepEqual(
    buildPostAddToCartSalesPlan({
        addedCategory: "principal",
        addedProductName: "Pizza Calabresa",
        latestOutboundText: "Confira nossas opcoes",
        hasAdditional: false,
        hasDrink: false,
    }),
    {
        nextCategory: "principal",
        searchQuery: "pizza media grande gigante",
        followupText:
            "Perfeito! Agora escolhe o tamanho da pizza: media, grande ou gigante. Ja te mostro as opcoes.",
        domain: "pizza",
    }
);

assert.deepEqual(
    buildPostAddToCartSalesPlan({
        addedCategory: "adicional",
        addedProductName: "Granola",
        latestOutboundText: "Agora ja te mostro os complementos pra montar seu acai do seu jeito.",
        hasAdditional: true,
        hasDrink: false,
    }),
    {
        nextCategory: "principal",
        searchQuery: "acai",
        followupText:
            "Boa! Quer aproveitar e levar mais um acai? Ja te mostro as opcoes que mais saem.",
        domain: "acai",
    }
);

assert.deepEqual(
    buildPostAddToCartSalesPlan({
        addedCategory: "adicional",
        addedProductName: "Granola",
        latestOutboundText: "Agora ja te mostro os complementos pra montar seu acai do seu jeito.",
        hasAdditional: true,
        hasDrink: false,
        preferredDomain: "acai",
        availability: { principal: true, adicional: true, bebida: false },
    }),
    {
        nextCategory: "principal",
        searchQuery: "acai",
        followupText:
            "Boa! Quer aproveitar e levar mais um acai? Ja te mostro as opcoes que mais saem.",
        domain: "acai",
    }
);

assert.equal(
    resolveCategoryForPlaybook({
        requestedCategory: "bebida",
        preferredDomain: "acai",
        availability: { principal: true, adicional: true, bebida: false },
        hasAdditional: true,
    }),
    "principal"
);

const burgerUpsellPlan = buildPostAddToCartSalesPlan({
    addedCategory: "principal",
    addedProductName: "Bacon Monster",
    latestOutboundText: "Confira nossas opcoes",
    hasAdditional: false,
    hasDrink: false,
});

assert.equal(burgerUpsellPlan.nextCategory, "adicional");
assert.equal(burgerUpsellPlan.searchQuery, "batata frita cheddar onion rings");
assert.equal(burgerUpsellPlan.domain, "burger");
assert.match(burgerUpsellPlan.followupText, /Adicionei Bacon Monster/i);

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
