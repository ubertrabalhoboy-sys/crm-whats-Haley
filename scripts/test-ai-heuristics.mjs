import assert from "node:assert/strict";
import {
    deriveExplicitCommercialState,
    determineRecommendedCommercialObjective,
    readCartSnapshotMeta,
} from "../src/lib/ai/heuristics.ts";

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

const emptyCart = readCartSnapshotMeta(null);
assert.equal(emptyCart.status, "sem_itens");
assert.equal(emptyCart.hasItems, false);
assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            cartSnapshotMeta: emptyCart,
        })
    ),
    "oferecer_produto_principal"
);
assert.equal(
    deriveExplicitCommercialState(
        makeContext({
            cartSnapshotMeta: emptyCart,
            dominantCustomerIntent: "saudacao",
        })
    ),
    "saudacao"
);

const principalCart = readCartSnapshotMeta({
    items: [{ product_id: "1", quantity: 1, category: "principal" }],
    subtotal: 25,
    discount: 0,
    delivery_fee: 0,
    total: 25,
    source: "calculate_cart_total",
});
assert.equal(principalCart.hasPrincipal, true);
assert.equal(principalCart.hasAdditional, false);
assert.equal(principalCart.hasDrink, false);
assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            cartSnapshotMeta: principalCart,
        })
    ),
    "oferecer_adicional"
);
assert.equal(
    deriveExplicitCommercialState(
        makeContext({
            cartSnapshotMeta: principalCart,
        })
    ),
    "oferta_adicional"
);

const principalAndAdditionalCart = readCartSnapshotMeta({
    items: [
        { product_id: "1", quantity: 1, category: "principal" },
        { product_id: "2", quantity: 1, category: "adicional" },
    ],
    subtotal: 32,
    discount: 0,
    delivery_fee: 0,
    total: 32,
    source: "calculate_cart_total",
});
assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            cartSnapshotMeta: principalAndAdditionalCart,
        })
    ),
    "oferecer_bebida"
);
assert.equal(
    deriveExplicitCommercialState(
        makeContext({
            cartSnapshotMeta: principalAndAdditionalCart,
        })
    ),
    "oferta_bebida"
);

assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            cartSnapshotMeta: principalCart,
            salesSignals: makeSignals({
                offeredAdditional: true,
            }),
        })
    ),
    "oferecer_bebida"
);

assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            cartSnapshotMeta: principalAndAdditionalCart,
            salesSignals: makeSignals({
                offeredDrink: true,
                customerRejectedOffer: true,
            }),
        })
    ),
    "confirmar_pagamento"
);

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
assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            cartSnapshotMeta: fullCart,
        })
    ),
    "confirmar_pagamento"
);
assert.equal(
    deriveExplicitCommercialState(
        makeContext({
            cartSnapshotMeta: fullCart,
            commercialPhase: "pagamento",
        })
    ),
    "coleta_pagamento"
);

const fullCartWithPayment = readCartSnapshotMeta({
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
assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            cartSnapshotMeta: fullCartWithPayment,
        })
    ),
    "fechar_pedido"
);
assert.equal(
    deriveExplicitCommercialState(
        makeContext({
            cartSnapshotMeta: fullCartWithPayment,
        })
    ),
    "fechamento"
);

const orderedCart = readCartSnapshotMeta({
    items: [{ product_id: "1", quantity: 1, category: "principal" }],
    subtotal: 25,
    discount: 0,
    delivery_fee: 0,
    total: 25,
    payment_method: "pix",
    order_id: "order-1",
    source: "submit_final_order",
});
assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            cartSnapshotMeta: orderedCart,
        })
    ),
    "acompanhar_pos_fechamento_ou_confirmar_pagamento"
);
assert.equal(
    deriveExplicitCommercialState(
        makeContext({
            cartSnapshotMeta: orderedCart,
        })
    ),
    "pos_venda"
);

assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            pendingSteps: ["solicitar_localizacao_nativa"],
            cartSnapshotMeta: fullCart,
        })
    ),
    "solicitar_localizacao_nativa"
);
assert.equal(
    deriveExplicitCommercialState(
        makeContext({
            pendingSteps: ["solicitar_localizacao_nativa"],
            cartSnapshotMeta: fullCart,
        })
    ),
    "coleta_endereco"
);

assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            resumptionSignal: "retomada_carrinho",
            cartSnapshotMeta: principalCart,
        })
    ),
    "retomar_carrinho_e_conduzir_fechamento"
);
assert.equal(
    deriveExplicitCommercialState(
        makeContext({
            resumptionSignal: "retomada_carrinho",
            cartSnapshotMeta: principalCart,
        })
    ),
    "abandono_recuperacao"
);

const calculatedCart = readCartSnapshotMeta({
    items: [
        { product_id: "1", quantity: 1, category: "principal" },
        { product_id: "2", quantity: 1, category: "adicional" },
    ],
    subtotal: 35,
    discount: 5,
    delivery_fee: 7,
    total: 37,
    source: "calculate_cart_total",
});
assert.equal(
    deriveExplicitCommercialState(
        makeContext({
            cartSnapshotMeta: calculatedCart,
        })
    ),
    "oferta_bebida"
);

assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            dominantCustomerIntent: "duvida",
        })
    ),
    "responder_duvida_e_guiar_para_proxima_acao"
);

assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            dominantCustomerIntent: "objecao",
        })
    ),
    "tratar_objecao_e_oferecer_alternativa"
);

assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            commercialPhase: "oferta_com_cupom",
            salesSignals: makeSignals({
                offeredAdditional: true,
                offeredDrink: true,
            }),
        })
    ),
    "oferecer_produto_com_cupom"
);

assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            commercialPhase: "pagamento",
            salesSignals: makeSignals({
                offeredAdditional: true,
                offeredDrink: true,
            }),
        })
    ),
    "confirmar_pagamento"
);

assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            dominantCustomerIntent: "fechamento_operacional",
        })
    ),
    "coletar_dados_finais_e_avancar_fechamento"
);

assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            cartSnapshotMeta: principalCart,
            salesSignals: makeSignals({
                customerRejectedOffer: true,
            }),
        })
    ),
    "oferecer_bebida"
);

assert.equal(
    determineRecommendedCommercialObjective(
        makeContext({
            cartSnapshotMeta: fullCartWithPayment,
            resumptionSignal: "retomada_carrinho",
        })
    ),
    "retomar_carrinho_e_conduzir_fechamento"
);

const malformedCart = readCartSnapshotMeta({
    items: [{ product_id: "1", quantity: 1, category: "principal" }],
    subtotal: "abc",
    discount: null,
    delivery_fee: undefined,
    total: 19,
    source: "calculate_cart_total",
});
assert.equal(malformedCart.subtotal, 0);
assert.equal(malformedCart.discount, 0);
assert.equal(malformedCart.deliveryFee, 0);
assert.equal(malformedCart.hasPrincipal, true);

console.log("AI heuristics smoke tests passed");
