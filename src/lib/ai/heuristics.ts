export type CartSnapshotMeta = {
    itemCount: number;
    hasItems: boolean;
    hasPrincipal: boolean;
    hasAdditional: boolean;
    hasDrink: boolean;
    subtotal: number;
    discount: number;
    deliveryFee: number;
    total: number;
    paymentMethod: string;
    hasPaymentMethod: boolean;
    source: string;
    orderId: string | null;
    hasOrder: boolean;
    status: "sem_itens" | "carrinho_montado" | "pedido_registrado";
};

export type SalesSignals = {
    offeredAdditional: boolean;
    offeredDrink: boolean;
    closeAttemptStarted: boolean;
    customerRejectedOffer: boolean;
};

export type ExplicitCommercialState =
    | "saudacao"
    | "oferta_principal"
    | "oferta_adicional"
    | "oferta_bebida"
    | "coleta_endereco"
    | "coleta_referencia"
    | "confirmacao_total"
    | "coleta_pagamento"
    | "fechamento"
    | "pos_venda"
    | "abandono_recuperacao";

type CommercialObjectiveInput = {
    pendingSteps: string[];
    commercialPhase: string;
    resumptionSignal: string;
    dominantCustomerIntent: string;
    cartSnapshotMeta: CartSnapshotMeta;
    salesSignals: SalesSignals;
};

function asPlainRecord(value: unknown) {
    if (typeof value === "object" && value !== null) {
        return value as Record<string, unknown>;
    }

    return null;
}

export function readCartSnapshotMeta(snapshot: unknown): CartSnapshotMeta {
    const record = asPlainRecord(snapshot);
    if (!record) {
        return {
            itemCount: 0,
            hasItems: false,
            hasPrincipal: false,
            hasAdditional: false,
            hasDrink: false,
            subtotal: 0,
            discount: 0,
            deliveryFee: 0,
            total: 0,
            paymentMethod: "nao_definido",
            hasPaymentMethod: false,
            source: "desconhecida",
            orderId: null,
            hasOrder: false,
            status: "sem_itens",
        };
    }

    const items = Array.isArray(record.items) ? record.items : [];
    const itemCount = items.length;
    const itemCategories = items
        .map((item) => {
            const itemRecord = asPlainRecord(item);
            return typeof itemRecord?.category === "string"
                ? itemRecord.category.toLowerCase()
                : null;
        })
        .filter((category): category is string => Boolean(category));
    const subtotal = Number(record.subtotal);
    const discount = Number(record.discount);
    const deliveryFee = Number(record.delivery_fee);
    const total = Number(record.total);
    const paymentMethod =
        typeof record.payment_method === "string" ? record.payment_method : "nao_definido";
    const source = typeof record.source === "string" ? record.source : "desconhecida";
    const orderId = typeof record.order_id === "string" ? record.order_id : null;
    const hasPaymentMethod = paymentMethod !== "nao_definido" && paymentMethod.trim().length > 0;
    const hasOrder = Boolean(orderId);

    return {
        itemCount,
        hasItems: itemCount > 0,
        hasPrincipal: itemCategories.includes("principal"),
        hasAdditional: itemCategories.includes("adicional"),
        hasDrink: itemCategories.includes("bebida"),
        subtotal: Number.isFinite(subtotal) ? subtotal : 0,
        discount: Number.isFinite(discount) ? discount : 0,
        deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : 0,
        total: Number.isFinite(total) ? total : 0,
        paymentMethod,
        hasPaymentMethod,
        source,
        orderId,
        hasOrder,
        status: hasOrder ? "pedido_registrado" : itemCount > 0 ? "carrinho_montado" : "sem_itens",
    };
}

export function determineRecommendedCommercialObjective(
    details: CommercialObjectiveInput
) {
    if (details.pendingSteps.length > 0) {
        return details.pendingSteps[0];
    }

    if (details.cartSnapshotMeta.hasOrder) {
        return "acompanhar_pos_fechamento_ou_confirmar_pagamento";
    }

    if (details.resumptionSignal === "resposta_a_followup") {
        return "retomar_contexto_e_reengajar";
    }

    if (details.resumptionSignal === "retomada_carrinho" && details.cartSnapshotMeta.hasItems) {
        return "retomar_carrinho_e_conduzir_fechamento";
    }

    if (details.dominantCustomerIntent === "duvida") {
        return "responder_duvida_e_guiar_para_proxima_acao";
    }

    if (details.dominantCustomerIntent === "objecao") {
        return "tratar_objecao_e_oferecer_alternativa";
    }

    if (details.dominantCustomerIntent === "fechamento_operacional") {
        return "coletar_dados_finais_e_avancar_fechamento";
    }

    if (details.commercialPhase === "pagamento") {
        return "confirmar_pagamento";
    }

    if (details.commercialPhase === "fechamento" || details.salesSignals.closeAttemptStarted) {
        return "fechar_pedido";
    }

    if (!details.cartSnapshotMeta.hasItems) {
        if (details.commercialPhase === "oferta_com_cupom") {
            return "oferecer_produto_com_cupom";
        }

        return "oferecer_produto_principal";
    }

    if (details.cartSnapshotMeta.hasItems && !details.cartSnapshotMeta.hasPaymentMethod) {
        if (!details.cartSnapshotMeta.hasPrincipal) {
            return "oferecer_produto_principal";
        }

        if (
            !details.cartSnapshotMeta.hasAdditional &&
            !details.salesSignals.customerRejectedOffer &&
            !details.salesSignals.offeredAdditional
        ) {
            return "oferecer_adicional";
        }

        if (!details.cartSnapshotMeta.hasDrink) {
            if (
                details.salesSignals.customerRejectedOffer &&
                details.salesSignals.offeredDrink
            ) {
                return "confirmar_pagamento";
            }

            return "oferecer_bebida";
        }

        return "confirmar_pagamento";
    }

    if (details.cartSnapshotMeta.hasItems && details.cartSnapshotMeta.hasPaymentMethod) {
        return "fechar_pedido";
    }

    if (details.salesSignals.customerRejectedOffer) {
        return "fazer_downsell_ou_avancar_fluxo";
    }

    if (details.commercialPhase === "oferta_com_cupom") {
        return "oferecer_produto_com_cupom";
    }

    if (details.commercialPhase === "oferta_produtos") {
        return "oferecer_produto_principal";
    }

    if (!details.salesSignals.offeredAdditional) {
        return "oferecer_produto_principal";
    }

    if (!details.salesSignals.offeredDrink) {
        return "oferecer_bebida";
    }

    return "conduzir_atendimento_e_identificar_melhor_proxima_oferta";
}

export function deriveExplicitCommercialState(
    details: CommercialObjectiveInput
): ExplicitCommercialState {
    if (
        (details.resumptionSignal === "resposta_a_followup" ||
            details.resumptionSignal === "retomada_carrinho") &&
        !details.cartSnapshotMeta.hasOrder
    ) {
        return "abandono_recuperacao";
    }

    if (details.cartSnapshotMeta.hasOrder) {
        return "pos_venda";
    }

    if (details.pendingSteps.includes("solicitar_localizacao_nativa")) {
        return "coleta_endereco";
    }

    if (details.pendingSteps.includes("coletar_endereco")) {
        return "coleta_endereco";
    }

    if (details.pendingSteps.includes("coletar_referencia")) {
        return "coleta_referencia";
    }

    if (details.commercialPhase === "pagamento") {
        return "coleta_pagamento";
    }

    if (
        details.cartSnapshotMeta.hasItems &&
        !details.cartSnapshotMeta.hasPaymentMethod &&
        details.cartSnapshotMeta.source === "calculate_cart_total" &&
        details.cartSnapshotMeta.hasPrincipal &&
        details.cartSnapshotMeta.hasAdditional &&
        details.cartSnapshotMeta.hasDrink
    ) {
        return "confirmacao_total";
    }

    if (
        details.commercialPhase === "fechamento" ||
        details.salesSignals.closeAttemptStarted ||
        details.cartSnapshotMeta.hasPaymentMethod
    ) {
        return "fechamento";
    }

    if (!details.cartSnapshotMeta.hasItems && details.dominantCustomerIntent === "saudacao") {
        return "saudacao";
    }

    if (!details.cartSnapshotMeta.hasItems || !details.cartSnapshotMeta.hasPrincipal) {
        return "oferta_principal";
    }

    if (!details.cartSnapshotMeta.hasAdditional) {
        return "oferta_adicional";
    }

    if (!details.cartSnapshotMeta.hasDrink) {
        return "oferta_bebida";
    }

    if (!details.cartSnapshotMeta.hasPaymentMethod) {
        return "coleta_pagamento";
    }

    return "fechamento";
}
