import assert from "node:assert/strict";
import {
    buildAiTurnSummary,
    createAiTurnMetrics,
    markIterationStarted,
    markPayloadFailed,
    markTextSent,
    markToolCompleted,
} from "../src/lib/ai/aiMetrics.ts";
import {
    determineRecommendedCommercialObjective,
    readCartSnapshotMeta,
} from "../src/lib/ai/heuristics.ts";
import {
    detectStructuredReplyIntent,
    detectUnverifiedCommercialClaim,
    shouldHandleDelayedCouponDeferral,
} from "../src/lib/ai/orchestratorRules.ts";

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

function toTitle(label) {
    return label.replace(/_/g, " ");
}

const transcriptScenarios = [
    {
        id: "roleta_loja_fechada_agendamento",
        validates: ["nao_pula_etapa", "segue_fluxo_roleta"],
        steps: [
            { role: "assistant", text: "A loja esta fechada agora, mas seu cupom esta garantido. Voce prefere usar outro dia?" },
            { role: "user", text: "pode ser" },
        ],
        run() {
            assert.equal(
                shouldHandleDelayedCouponDeferral({
                    latestInboundText: this.steps[1].text,
                    latestOutboundText: this.steps[0].text,
                    hasCartItems: false,
                }),
                true
            );
        },
    },
    {
        id: "principal_gera_oferta_de_adicional",
        validates: ["segue_ordem_comercial", "nao_repete_oferta"],
        steps: [
            { role: "user", text: "quero um x-burguer" },
            { role: "assistant", text: "Perfeito, vou separar seu principal." },
        ],
        run() {
            const cartSnapshotMeta = readCartSnapshotMeta({
                items: [{ product_id: "p1", quantity: 1, category: "principal" }],
                subtotal: 28,
                discount: 0,
                delivery_fee: 0,
                total: 28,
                source: "calculate_cart_total",
            });

            assert.equal(
                determineRecommendedCommercialObjective(
                    makeObjectiveInput({ cartSnapshotMeta })
                ),
                "oferecer_adicional"
            );
        },
    },
    {
        id: "adicional_gera_oferta_de_bebida",
        validates: ["segue_ordem_comercial", "nao_repete_oferta"],
        steps: [
            { role: "assistant", text: "Quer adicionar uma batata?" },
            { role: "user", text: "sim, pode colocar" },
        ],
        run() {
            const cartSnapshotMeta = readCartSnapshotMeta({
                items: [
                    { product_id: "p1", quantity: 1, category: "principal" },
                    { product_id: "a1", quantity: 1, category: "adicional" },
                ],
                subtotal: 36,
                discount: 0,
                delivery_fee: 0,
                total: 36,
                source: "calculate_cart_total",
            });

            assert.equal(
                determineRecommendedCommercialObjective(
                    makeObjectiveInput({ cartSnapshotMeta })
                ),
                "oferecer_bebida"
            );
        },
    },
    {
        id: "fechamento_dispara_botao_de_localizacao",
        validates: ["usa_midia_certa", "nao_pula_etapa"],
        steps: [
            { role: "user", text: "e so isso" },
            { role: "assistant", text: "Perfeito. Agora compartilhe sua localizacao para eu seguir." },
        ],
        run() {
            assert.deepEqual(
                detectStructuredReplyIntent({
                    text: this.steps[1].text,
                    hasCartItems: true,
                    locationConfirmed: false,
                    addressConfirmed: false,
                    referenceConfirmed: false,
                    hasFreightCalculation: false,
                    hasPaymentMethod: false,
                }),
                { kind: "request_location" }
            );
        },
    },
    {
        id: "pagamento_dispara_botoes",
        validates: ["usa_midia_certa", "nao_pula_etapa"],
        steps: [
            { role: "assistant", text: "Resumo pronto." },
            { role: "assistant", text: "Como prefere pagar? PIX, Dinheiro ou Cartao?" },
        ],
        run() {
            assert.deepEqual(
                detectStructuredReplyIntent({
                    text: this.steps[1].text,
                    hasCartItems: true,
                    locationConfirmed: true,
                    addressConfirmed: true,
                    referenceConfirmed: true,
                    hasFreightCalculation: true,
                    hasPaymentMethod: false,
                }),
                { kind: "payment_buttons" }
            );
        },
    },
    {
        id: "oferta_de_adicional_dispara_catalogo_correspondente",
        validates: ["usa_midia_certa", "segue_ordem_comercial"],
        steps: [
            { role: "assistant", text: "Que tal um adicional pra acompanhar? Temos umas opcoes bem boas." },
        ],
        run() {
            assert.deepEqual(
                detectStructuredReplyIntent({
                    text: this.steps[0].text,
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
        },
    },
    {
        id: "pedido_generico_de_opcoes_puxa_proxima_categoria",
        validates: ["usa_midia_certa", "segue_ordem_comercial"],
        steps: [
            { role: "assistant", text: "Confira nossas opcoes:" },
        ],
        run() {
            assert.deepEqual(
                detectStructuredReplyIntent({
                    text: this.steps[0].text,
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
        },
    },
    {
        id: "frete_sem_calculo_nao_pode_ser_confirmado",
        validates: ["nao_inventa_valor", "mantem_grounding"],
        steps: [
            { role: "assistant", text: "Seu frete ficou em R$ 8,50." },
        ],
        run() {
            assert.deepEqual(
                detectUnverifiedCommercialClaim(this.steps[0].text, {
                    hasFreightCalculation: false,
                    hasPixQuote: false,
                }),
                {
                    risky: true,
                    reason: "UNVERIFIED_FREIGHT_VALUE",
                    safeFallbackText:
                        "Vou confirmar o valor exato do frete no sistema antes de te passar.",
                }
            );
        },
    },
    {
        id: "resposta_com_endereco_texto_nao_pede_pagamento_antes_do_gps",
        validates: ["nao_pula_etapa", "usa_midia_certa"],
        steps: [
            { role: "user", text: "Rua Teofilo Otoni 127" },
            { role: "assistant", text: "Perfeito. Agora me manda sua localizacao para eu calcular certinho." },
        ],
        run() {
            assert.equal(
                detectStructuredReplyIntent({
                    text: this.steps[1].text,
                    hasCartItems: true,
                    locationConfirmed: false,
                    addressConfirmed: true,
                    referenceConfirmed: false,
                    hasFreightCalculation: false,
                    hasPaymentMethod: false,
                })?.kind,
                "request_location"
            );
        },
    },
    {
        id: "gps_recebido_sem_referencia_ainda_nao_gera_pagamento",
        validates: ["nao_pula_etapa", "mantem_fluxo_logistico"],
        steps: [
            { role: "user", text: "CLIENT_ACTION:location_shared lat=-19.9 lng=-44.0" },
            { role: "assistant", text: "Agora me manda o numero da casa e um ponto de referencia." },
        ],
        run() {
            assert.equal(
                detectStructuredReplyIntent({
                    text: this.steps[1].text,
                    hasCartItems: true,
                    locationConfirmed: true,
                    addressConfirmed: false,
                    referenceConfirmed: false,
                    hasFreightCalculation: false,
                    hasPaymentMethod: false,
                }),
                null
            );
        },
    },
    {
        id: "carrinho_completo_sem_pagamento_confirma_pagamento",
        validates: ["segue_ordem_comercial", "usa_midia_certa", "mantem_fluxo_logistico"],
        steps: [
            { role: "assistant", text: "Seu total ficou certinho." },
            { role: "assistant", text: "Como prefere pagar? PIX, Dinheiro ou Cartao?" },
        ],
        run() {
            const cartSnapshotMeta = readCartSnapshotMeta({
                items: [
                    { product_id: "p1", quantity: 1, category: "principal" },
                    { product_id: "a1", quantity: 1, category: "adicional" },
                    { product_id: "b1", quantity: 1, category: "bebida" },
                ],
                subtotal: 48,
                discount: 8,
                delivery_fee: 6,
                total: 46,
                source: "calculate_cart_total",
            });

            assert.equal(
                determineRecommendedCommercialObjective(
                    makeObjectiveInput({ cartSnapshotMeta })
                ),
                "confirmar_pagamento"
            );
            assert.deepEqual(
                detectStructuredReplyIntent({
                    text: this.steps[1].text,
                    hasCartItems: true,
                    locationConfirmed: true,
                    addressConfirmed: true,
                    referenceConfirmed: true,
                    hasFreightCalculation: true,
                    hasPaymentMethod: false,
                }),
                { kind: "payment_buttons" }
            );
        },
    },
    {
        id: "cliente_recusa_adicional_avanca_para_bebida",
        validates: ["segue_ordem_comercial", "nao_repete_oferta"],
        steps: [
            { role: "assistant", text: "Quer adicionar uma batata?" },
            { role: "user", text: "nao" },
        ],
        run() {
            const cartSnapshotMeta = readCartSnapshotMeta({
                items: [{ product_id: "p1", quantity: 1, category: "principal" }],
                subtotal: 28,
                discount: 0,
                delivery_fee: 0,
                total: 28,
                source: "calculate_cart_total",
            });

            assert.equal(
                determineRecommendedCommercialObjective(
                    makeObjectiveInput({
                        cartSnapshotMeta,
                        salesSignals: makeSignals({
                            offeredAdditional: true,
                            customerRejectedOffer: true,
                        }),
                    })
                ),
                "oferecer_bebida"
            );
        },
    },
    {
        id: "cliente_recusa_bebida_com_carrinho_completo_avanca_para_pagamento",
        validates: ["segue_ordem_comercial", "nao_repete_oferta", "mantem_fluxo_logistico"],
        steps: [
            { role: "assistant", text: "Quer uma bebida para acompanhar?" },
            { role: "user", text: "nao, so isso" },
        ],
        run() {
            const cartSnapshotMeta = readCartSnapshotMeta({
                items: [
                    { product_id: "p1", quantity: 1, category: "principal" },
                    { product_id: "a1", quantity: 1, category: "adicional" },
                ],
                subtotal: 36,
                discount: 0,
                delivery_fee: 0,
                total: 36,
                source: "calculate_cart_total",
            });

            assert.equal(
                determineRecommendedCommercialObjective(
                    makeObjectiveInput({
                        cartSnapshotMeta,
                        salesSignals: makeSignals({
                            offeredDrink: true,
                            customerRejectedOffer: true,
                        }),
                    })
                ),
                "confirmar_pagamento"
            );
        },
    },
    {
        id: "pix_sem_cotacao_nao_pode_ser_confirmado",
        validates: ["nao_inventa_valor", "mantem_grounding"],
        steps: [
            { role: "assistant", text: "O pagamento via PIX ficou em R$ 42,00." },
        ],
        run() {
            assert.deepEqual(
                detectUnverifiedCommercialClaim(this.steps[0].text, {
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
        },
    },
    {
        id: "usar_agora_nao_cai_em_agendamento",
        validates: ["segue_fluxo_roleta", "nao_pula_etapa"],
        steps: [
            { role: "assistant", text: "A loja esta fechada agora, mas seu cupom esta garantido. Voce prefere usar agora ou outro dia?" },
            { role: "user", text: "usar agora" },
        ],
        run() {
            assert.equal(
                shouldHandleDelayedCouponDeferral({
                    latestInboundText: this.steps[1].text,
                    latestOutboundText: this.steps[0].text,
                    hasCartItems: false,
                }),
                false
            );
        },
    },
    {
        id: "resposta_repetida_de_agendamento_com_carrinho_nao_reagenda",
        validates: ["nao_pula_etapa", "nao_repete_oferta"],
        steps: [
            { role: "assistant", text: "A loja esta fechada agora, mas seu cupom esta garantido. Voce prefere usar outro dia?" },
            { role: "user", text: "ok" },
        ],
        run() {
            assert.equal(
                shouldHandleDelayedCouponDeferral({
                    latestInboundText: this.steps[1].text,
                    latestOutboundText: this.steps[0].text,
                    hasCartItems: true,
                }),
                false
            );
        },
    },
    {
        id: "pagamento_sem_frete_calculado_nao_dispara_botoes",
        validates: ["nao_pula_etapa", "mantem_fluxo_logistico"],
        steps: [
            { role: "assistant", text: "Como prefere pagar? PIX, Dinheiro ou Cartao?" },
        ],
        run() {
            assert.equal(
                detectStructuredReplyIntent({
                    text: this.steps[0].text,
                    hasCartItems: true,
                    locationConfirmed: true,
                    addressConfirmed: true,
                    referenceConfirmed: true,
                    hasFreightCalculation: false,
                    hasPaymentMethod: false,
                }),
                null
            );
        },
    },
    {
        id: "retomada_de_carrinho_retomar_fechamento",
        validates: ["mantem_fluxo_logistico", "segue_ordem_comercial"],
        steps: [
            { role: "assistant", text: "Seu pedido ficou em aberto." },
            { role: "user", text: "voltei" },
        ],
        run() {
            const cartSnapshotMeta = readCartSnapshotMeta({
                items: [
                    { product_id: "p1", quantity: 1, category: "principal" },
                    { product_id: "a1", quantity: 1, category: "adicional" },
                ],
                subtotal: 36,
                discount: 0,
                delivery_fee: 6,
                total: 42,
                source: "calculate_cart_total",
            });

            assert.equal(
                determineRecommendedCommercialObjective(
                    makeObjectiveInput({
                        cartSnapshotMeta,
                        resumptionSignal: "retomada_carrinho",
                    })
                ),
                "retomar_carrinho_e_conduzir_fechamento"
            );
        },
    },
    {
        id: "pedido_registrado_nao_reabre_venda",
        validates: ["nao_pula_etapa", "segue_ordem_comercial"],
        steps: [
            { role: "assistant", text: "Seu pedido foi criado." },
            { role: "user", text: "ok" },
        ],
        run() {
            const cartSnapshotMeta = readCartSnapshotMeta({
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
                order_id: "ord-001",
                source: "submit_final_order",
            });

            assert.equal(
                determineRecommendedCommercialObjective(
                    makeObjectiveInput({ cartSnapshotMeta })
                ),
                "acompanhar_pos_fechamento_ou_confirmar_pagamento"
            );
        },
    },
    {
        id: "falha_de_carrossel_cai_em_texto_de_contingencia",
        validates: ["mantem_contingencia_operacional"],
        steps: [
            { role: "assistant", text: "Confira nossas opcoes:" },
        ],
        run() {
            const metrics = createAiTurnMetrics();
            markIterationStarted(metrics);
            markToolCompleted(metrics, {
                toolName: "send_uaz_carousel",
                blocked: false,
                skipped: false,
                ok: true,
            });
            markPayloadFailed(metrics);
            markTextSent(metrics);

            const summary = buildAiTurnSummary(metrics, {
                maxIterationsReached: false,
            });

            assert.equal(summary.outcome, "text_sent");
            assert.equal(summary.payloadFailures, 1);
            assert.equal(summary.textSent, 1);
        },
    },
    {
        id: "falha_de_botoes_cai_em_texto_de_contingencia",
        validates: ["mantem_contingencia_operacional"],
        steps: [
            { role: "assistant", text: "Como prefere pagar?" },
        ],
        run() {
            const metrics = createAiTurnMetrics();
            markIterationStarted(metrics);
            markToolCompleted(metrics, {
                toolName: "send_uaz_buttons",
                blocked: false,
                skipped: false,
                ok: true,
            });
            markPayloadFailed(metrics);
            markTextSent(metrics);

            const summary = buildAiTurnSummary(metrics, {
                maxIterationsReached: false,
            });

            assert.equal(summary.outcome, "text_sent");
            assert.equal(summary.lastToolName, "send_uaz_buttons");
            assert.equal(summary.payloadFailures, 1);
        },
    },
];

const scoreByCriterion = new Map();
const failures = [];

for (const scenario of transcriptScenarios) {
    try {
        scenario.run();
        for (const criterion of scenario.validates) {
            const current = scoreByCriterion.get(criterion) || { passed: 0, total: 0 };
            scoreByCriterion.set(criterion, {
                passed: current.passed + 1,
                total: current.total + 1,
            });
        }
    } catch (error) {
        failures.push({
            id: scenario.id,
            error: error instanceof Error ? error.message : String(error),
        });
        for (const criterion of scenario.validates) {
            const current = scoreByCriterion.get(criterion) || { passed: 0, total: 0 };
            scoreByCriterion.set(criterion, {
                passed: current.passed,
                total: current.total + 1,
            });
        }
    }
}

const totalCriteriaChecks = [...scoreByCriterion.values()].reduce(
    (sum, item) => sum + item.total,
    0
);
const totalCriteriaPasses = [...scoreByCriterion.values()].reduce(
    (sum, item) => sum + item.passed,
    0
);
const overallScore =
    totalCriteriaChecks > 0
        ? ((totalCriteriaPasses / totalCriteriaChecks) * 100).toFixed(1)
        : "0.0";

console.log(`AI transcript scenarios passed (${transcriptScenarios.length} casos)`);
console.log(`AI transcript benchmark score: ${overallScore}%`);

for (const [criterion, result] of [...scoreByCriterion.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
)) {
    const percent = result.total > 0 ? ((result.passed / result.total) * 100).toFixed(1) : "0.0";
    console.log(
        `- ${toTitle(criterion)}: ${result.passed}/${result.total} (${percent}%)`
    );
}

if (failures.length > 0) {
    console.error("AI transcript scenario failures:");
    for (const failure of failures) {
        console.error(`- ${failure.id}: ${failure.error}`);
    }
}

assert.equal(failures.length, 0);
