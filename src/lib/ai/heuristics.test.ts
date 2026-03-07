import { describe, it, expect } from "vitest";
import {
    deriveExplicitCommercialState,
    determineRecommendedCommercialObjective,
    readCartSnapshotMeta,
} from "./heuristics";

function makeSignals(overrides = {}) {
    return {
        offeredAdditional: false,
        offeredDrink: false,
        closeAttemptStarted: false,
        customerRejectedOffer: false,
        ...overrides,
    };
}

function makeContext(overrides = {}) {
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

describe("AI Heuristics", () => {
    const emptyCart = readCartSnapshotMeta(null);

    it("should correctly handle empty cart meta", () => {
        expect(emptyCart.status).toBe("sem_itens");
        expect(emptyCart.hasItems).toBe(false);
    });

    it("should recommend offering principal product for empty cart", () => {
        const context = makeContext({ cartSnapshotMeta: emptyCart });
        expect(determineRecommendedCommercialObjective(context)).toBe("oferecer_produto_principal");
    });

    it("should derive 'saudacao' state for empty cart with greeting intent", () => {
        const context = makeContext({
            cartSnapshotMeta: emptyCart,
            dominantCustomerIntent: "saudacao",
        });
        expect(deriveExplicitCommercialState(context)).toBe("saudacao");
    });

    describe("Cart with Principal Product", () => {
        const principalCart = readCartSnapshotMeta({
            items: [{ product_id: "1", quantity: 1, category: "principal" }],
            subtotal: 25,
            discount: 0,
            delivery_fee: 0,
            total: 25,
            source: "calculate_cart_total",
        });

        it("should correctly detect principal product", () => {
            expect(principalCart.hasPrincipal).toBe(true);
            expect(principalCart.hasAdditional).toBe(false);
        });

        it("should recommend offering additional product", () => {
            const context = makeContext({ cartSnapshotMeta: principalCart });
            expect(determineRecommendedCommercialObjective(context)).toBe("oferecer_adicional");
        });

        it("should derive 'oferta_adicional' state", () => {
            const context = makeContext({ cartSnapshotMeta: principalCart });
            expect(deriveExplicitCommercialState(context)).toBe("oferta_adicional");
        });
    });

    describe("Full Cart", () => {
        const fullCart = readCartSnapshotMeta({
            items: [
                { product_id: "1", quantity: 1, category: "principal" },
                { product_id: "2", quantity: 1, category: "adicional" },
                { product_id: "3", quantity: 1, category: "bebida" },
            ],
            subtotal: 40,
            discount: 5,
            delivery_fee: 7,
            total: 42,
            source: "calculate_cart_total",
        });

        it("should recommend confirming payment", () => {
            const context = makeContext({ cartSnapshotMeta: fullCart });
            expect(determineRecommendedCommercialObjective(context)).toBe("confirmar_pagamento");
        });

        it("should derive 'coleta_pagamento' when phase is payment", () => {
            const context = makeContext({
                cartSnapshotMeta: fullCart,
                commercialPhase: "pagamento",
            });
            expect(deriveExplicitCommercialState(context)).toBe("coleta_pagamento");
        });

        it("should require review before final close when payment is already selected", () => {
            const paidCart = readCartSnapshotMeta({
                items: [
                    { product_id: "1", quantity: 1, category: "principal" },
                    { product_id: "2", quantity: 1, category: "adicional" },
                    { product_id: "3", quantity: 1, category: "bebida" },
                ],
                subtotal: 40,
                discount: 5,
                delivery_fee: 7,
                total: 42,
                payment_method: "pix",
                source: "calculate_cart_total",
            });
            const context = makeContext({ cartSnapshotMeta: paidCart });
            expect(determineRecommendedCommercialObjective(context)).toBe("revisar_itens_e_confirmar_pedido");
            expect(deriveExplicitCommercialState(context)).toBe("revisao_pedido");
        });
    });

    describe("Edge Cases & Intent handling", () => {
        it("should prioritize pending steps (e.g. location request)", () => {
            const context = makeContext({
                pendingSteps: ["solicitar_localizacao_nativa"],
            });
            expect(determineRecommendedCommercialObjective(context)).toBe("solicitar_localizacao_nativa");
            expect(deriveExplicitCommercialState(context)).toBe("coleta_endereco");
        });

        it("should handle cart resumption signal", () => {
            const context = makeContext({
                resumptionSignal: "retomada_carrinho",
                cartSnapshotMeta: readCartSnapshotMeta({
                    items: [{ product_id: "1", category: "principal" }]
                }),
            });
            expect(determineRecommendedCommercialObjective(context)).toBe("retomar_carrinho_e_conduzir_fechamento");
            expect(deriveExplicitCommercialState(context)).toBe("abandono_recuperacao");
        });

        it("should handle malformed cart data gracefully", () => {
            const malformedCart = readCartSnapshotMeta({
                items: [{ product_id: "1", quantity: 1, category: "principal" }],
                subtotal: "abc",
                total: 19,
            });
            expect(malformedCart.subtotal).toBe(0);
            expect(malformedCart.hasPrincipal).toBe(true);
        });

        it("should bring conversation back to flow on small talk intent", () => {
            const context = makeContext({
                dominantCustomerIntent: "conversa_fiada",
                cartSnapshotMeta: readCartSnapshotMeta({
                    items: [{ product_id: "1", quantity: 1, category: "principal" }],
                    subtotal: 20,
                    discount: 0,
                    delivery_fee: 0,
                    total: 20,
                    source: "calculate_cart_total",
                }),
            });
            expect(determineRecommendedCommercialObjective(context)).toBe(
                "trazer_de_volta_ao_fluxo_e_conduzir_fechamento"
            );
        });
    });
});
