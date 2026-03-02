type OutboundReplacements = {
    restaurantName: string;
    kanbanStatus: string;
    cupomGanho: string;
};

type TurnEvidence = {
    hasFreightCalculation: boolean;
    hasPixQuote: boolean;
};

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
