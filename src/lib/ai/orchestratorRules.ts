type OutboundReplacements = {
    restaurantName: string;
    kanbanStatus: string;
    cupomGanho: string;
};

type TurnEvidence = {
    hasFreightCalculation: boolean;
    hasPixQuote: boolean;
};

type DelayedCouponDeferralContext = {
    latestInboundText: string;
    latestOutboundText: string;
    hasCartItems: boolean;
};

type StructuredReplyContext = {
    text: string;
    hasCartItems: boolean;
    locationConfirmed: boolean;
    addressConfirmed: boolean;
    referenceConfirmed: boolean;
    hasFreightCalculation: boolean;
    hasPaymentMethod: boolean;
    hasPrincipal?: boolean;
    hasAdditional?: boolean;
    hasDrink?: boolean;
    hasOrder?: boolean;
};

type RouletteChoiceContext = {
    latestInboundText: string;
    latestOutboundText: string;
    hasCartItems: boolean;
};

function normalizeLooseText(text: string) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

export function stripThoughtBlocks(text: string) {
    return text
        .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .replace(/```(?:thought|thinking)[\s\S]*?```/gi, "")
        .trim();
}

export function normalizeOutboundText(
    text: string,
    replacements: OutboundReplacements
) {
    const normalized = stripThoughtBlocks(text)
        .replace(/{nome_restaurante}/gi, replacements.restaurantName)
        .replace(/{kanban_status}/gi, replacements.kanbanStatus)
        .replace(/{cupom_ganho}/gi, replacements.cupomGanho)
        .trim();

    if (!normalized) {
        return { ok: false, reason: "EMPTY_TEXT_AFTER_NORMALIZATION" } as const;
    }

    if (
        /<\/?(?:thought|thinking)>/i.test(normalized) ||
        /```(?:thought|thinking)/i.test(normalized)
    ) {
        return { ok: false, reason: "INTERNAL_REASONING_MARKER_DETECTED" } as const;
    }

    const looksLikeRawToolPayload =
        normalized.startsWith("{") &&
        /"(?:ok|error|uazapi_payload|functionCall|functionResponse)"/i.test(normalized);
    if (looksLikeRawToolPayload) {
        return { ok: false, reason: "RAW_TOOL_PAYLOAD_DETECTED" } as const;
    }

    return { ok: true, text: normalized } as const;
}

export function detectUnverifiedCommercialClaim(
    text: string,
    evidence: TurnEvidence
) {
    const normalized = text.toLowerCase();
    const hasMonetaryAmount =
        /r\$\s*\d/i.test(normalized) || /\b\d+[.,]\d{2}\b/.test(normalized);
    const mentionsFreightWithAmount =
        hasMonetaryAmount &&
        /(frete|entrega)/i.test(normalized);
    const mentionsPixWithAmount =
        hasMonetaryAmount &&
        /(pix|pagamento)/i.test(normalized);

    if (mentionsFreightWithAmount && !evidence.hasFreightCalculation) {
        return {
            risky: true,
            reason: "UNVERIFIED_FREIGHT_VALUE",
            safeFallbackText: "Vou confirmar o valor exato do frete no sistema antes de te passar.",
        } as const;
    }

    if (mentionsPixWithAmount && !evidence.hasPixQuote) {
        return {
            risky: true,
            reason: "UNVERIFIED_PIX_VALUE",
            safeFallbackText: "Vou confirmar o valor certinho do pagamento antes de seguir.",
        } as const;
    }

    return { risky: false } as const;
}

export function shouldHandleDelayedCouponDeferral(
    details: DelayedCouponDeferralContext
) {
    if (details.hasCartItems) {
        return false;
    }

    const latestInboundNormalized = normalizeLooseText(details.latestInboundText);
    const latestOutboundNormalized = normalizeLooseText(details.latestOutboundText);

    if (!latestInboundNormalized || !latestOutboundNormalized) {
        return false;
    }

    const acceptedDeferral =
        /^(sim|pode ser|pode sim|ta bom|tudo bem|beleza|blz|ok|certo|fechou|outro dia)\b/.test(
            latestInboundNormalized
        ) ||
        /^(pode|ta|tah)\b/.test(latestInboundNormalized);

    if (!acceptedDeferral) {
        return false;
    }

    const asksForAnotherDay =
        latestOutboundNormalized.includes("outro dia") ||
        latestOutboundNormalized.includes("usar outro dia");
    const mentionsCouponFlow =
        /(cupom|premio|roleta|loja|cozinha|descansando|fechad)/.test(
            latestOutboundNormalized
        );

    return asksForAnotherDay && mentionsCouponFlow;
}

export function detectStructuredReplyIntent(details: StructuredReplyContext) {
    const normalized = normalizeLooseText(details.text);

    const asksForLocation =
        details.hasCartItems &&
        !details.locationConfirmed &&
        /(localiz|gps|compartilh)/.test(normalized);

    if (asksForLocation) {
        return { kind: "request_location" as const };
    }

    const asksForPaymentChoice =
        details.locationConfirmed &&
        details.addressConfirmed &&
        details.referenceConfirmed &&
        details.hasFreightCalculation &&
        !details.hasPaymentMethod &&
        /pix/.test(normalized) &&
        /(dinheiro|cartao|cartao)/.test(normalized) &&
        /(pagamento|pagar|forma de pagamento|como prefere|escolha)/.test(normalized);

    if (asksForPaymentChoice) {
        return { kind: "payment_buttons" as const };
    }

    const mentionsPrincipal =
        /(principal|lanche|burger|hamburg|sanduiche|sanduiche)/.test(normalized);
    const mentionsAdditional =
        /(adicional|acompanh|extra|complemento|batata|anel de cebola)/.test(
            normalized
        );
    const mentionsDrink =
        /(bebida|refrigerante|suco|agua|cha|guarana|coca)/.test(normalized);
    const mentionedCategories = [
        mentionsPrincipal ? "principal" : null,
        mentionsAdditional ? "adicional" : null,
        mentionsDrink ? "bebida" : null,
    ].filter((value): value is "principal" | "adicional" | "bebida" => Boolean(value));
    const genericCatalogPrompt =
        /(confira nossas opcoes|vou te mostrar|vou te mandar|da uma olhada|olha as opcoes)/.test(
            normalized
        );

    let categoryIntent: "principal" | "adicional" | "bebida" | null =
        mentionedCategories.length === 1 ? mentionedCategories[0] : null;

    if (
        !categoryIntent &&
        genericCatalogPrompt &&
        !details.hasOrder &&
        !details.hasFreightCalculation &&
        !details.hasPaymentMethod
    ) {
        if (!details.hasPrincipal) {
            categoryIntent = "principal";
        } else if (!details.hasAdditional) {
            categoryIntent = "adicional";
        } else if (!details.hasDrink) {
            categoryIntent = "bebida";
        }
    }

    if (categoryIntent === "principal" && !details.hasPrincipal) {
        return { kind: "category_catalog" as const, category: "principal" as const };
    }

    if (
        categoryIntent === "adicional" &&
        details.hasPrincipal &&
        !details.hasAdditional
    ) {
        return { kind: "category_catalog" as const, category: "adicional" as const };
    }

    if (
        categoryIntent === "bebida" &&
        details.hasPrincipal &&
        !details.hasDrink
    ) {
        return { kind: "category_catalog" as const, category: "bebida" as const };
    }

    return null;
}

export function isRoulettePrizeTrigger(text: string) {
    const normalized = normalizeLooseText(text);
    return normalized.includes("roleta:");
}

export function detectRouletteChoiceIntent(details: RouletteChoiceContext) {
    if (details.hasCartItems) {
        return null;
    }

    const latestInboundNormalized = normalizeLooseText(details.latestInboundText);
    const latestOutboundNormalized = normalizeLooseText(details.latestOutboundText);

    if (!latestInboundNormalized || !latestOutboundNormalized) {
        return null;
    }

    const isChoicePrompt =
        latestOutboundNormalized.includes("usar agora") &&
        latestOutboundNormalized.includes("outro dia");

    if (!isChoicePrompt) {
        return null;
    }

    if (
        latestInboundNormalized.includes("outro dia") ||
        latestInboundNormalized.includes("mais tarde") ||
        latestInboundNormalized.includes("depois")
    ) {
        return "use_later" as const;
    }

    if (latestInboundNormalized.includes("agora")) {
        return "use_now" as const;
    }

    return null;
}
