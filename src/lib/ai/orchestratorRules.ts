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

    return null;
}
