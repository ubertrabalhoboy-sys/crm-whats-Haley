import assert from "node:assert/strict";
import {
    detectUnverifiedCommercialClaim,
    normalizeOutboundText,
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
    "Olá, eu sou da {nome_restaurante}. Status {kanban_status}. Cupom: {cupom_ganho}",
    {
        restaurantName: "FoodSpin",
        kanbanStatus: "Em atendimento",
        cupomGanho: "GANHE10",
    }
);
assert.deepEqual(normalizedWithPlaceholders, {
    ok: true,
    text: "Olá, eu sou da FoodSpin. Status Em atendimento. Cupom: GANHE10",
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

console.log("AI orchestrator rules smoke tests passed");
