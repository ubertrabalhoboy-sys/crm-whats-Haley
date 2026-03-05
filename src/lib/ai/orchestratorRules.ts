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

type AutoCalculateAfterOperationalInputContext = {
    latestOutboundText: string;
    receivedOperationalInput: boolean;
    hasCartItems: boolean;
    locationConfirmed: boolean;
    addressConfirmed: boolean;
    referenceConfirmed: boolean;
    hasPaymentMethod: boolean;
    hasOrder?: boolean;
};

type SalesObjectionContext = {
    latestInboundText: string;
    latestOutboundText: string;
    hasCartItems: boolean;
    hasPrincipal?: boolean;
    hasAdditional?: boolean;
    hasDrink?: boolean;
    hasPaymentMethod?: boolean;
    hasOrder?: boolean;
    preferredDomain?: SalesDomain;
    availability?: Partial<CategoryAvailability> | null;
};

type AddToCartAction = {
    productId: string;
    productName: string;
    category: "principal" | "adicional" | "bebida";
};

export type SalesDomain = "burger" | "acai" | "pizza" | "sushi" | "generic";
export type CategoryAvailability = {
    principal: boolean;
    adicional: boolean;
    bebida: boolean;
};

function normalizeLooseText(text: string) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

export function parseAddToCartClientAction(text: string): AddToCartAction | null {
    const trimmed = String(text || "").trim();
    const match = trimmed.match(
        /^CLIENT_ACTION:add_to_cart\s+product_id=([0-9a-f-]{36})\s+product_name="([^"]+)"\s+category=([a-z_]+)$/i
    );

    if (!match) {
        return null;
    }

    const rawCategory = match[3].toLowerCase();
    const category =
        rawCategory === "adicional" || rawCategory === "bebida"
            ? rawCategory
            : "principal";

    return {
        productId: match[1],
        productName: match[2],
        category,
    };
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
    const asksForCategoryChoice =
        !details.hasCartItems &&
        /(cardapio|catalogo|categoria|quer ver primeiro|qual categoria)/.test(
            normalized
        ) &&
        /principal/.test(normalized) &&
        /adicional/.test(normalized) &&
        /bebida/.test(normalized);

    if (asksForCategoryChoice) {
        return { kind: "category_catalog" as const, category: "principal" as const };
    }

    const asksForLocation =
        details.hasCartItems &&
        !details.locationConfirmed &&
        /(localiz|gps|compartilh|endereco|enderec|rua|onde entregar)/.test(normalized);

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
    const genericCatalogPrompt =
        /(confira nossas opcoes|vou te mostrar|vou te mandar|da uma olhada|olha as opcoes)/.test(
            normalized
        );

    let categoryIntent: "principal" | "adicional" | "bebida" | null = null;

    if (mentionsDrink && details.hasPrincipal && !details.hasDrink) {
        categoryIntent = "bebida";
    } else if (mentionsAdditional && details.hasPrincipal && !details.hasAdditional) {
        categoryIntent = "adicional";
    } else if (mentionsPrincipal && !details.hasPrincipal) {
        categoryIntent = "principal";
    }

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

    const wantsNow =
        latestInboundNormalized.includes("agora") ||
        latestInboundNormalized.includes("hoje") ||
        /\bhj\b/.test(latestInboundNormalized) ||
        /^(usar\s+agora|agora\s+sim|pode\s+agora)/.test(latestInboundNormalized);

    if (wantsNow) {
        return "use_now" as const;
    }

    return null;
}

export function isGreetingOnly(text: string) {
    const normalized = normalizeLooseText(text);
    if (!normalized) return false;
    return /^(oi|ola|opa|bom dia|boa tarde|boa noite|e ai|eae|oii+)$/.test(normalized);
}

export function isNeutralInboundWithoutCatalogIntent(text: string) {
    const normalized = normalizeLooseText(text);
    if (!normalized) return false;
    if (isGreetingOnly(normalized)) return true;
    return /^(ok|okay|blz|beleza|ta bom|tudo bem|certo|entendi|show|valeu)$/.test(
        normalized
    );
}

export function buildActiveCategoryPitch(
    category: "principal" | "adicional" | "bebida",
    cupomGanho?: string | null
) {
    const hasCoupon =
        typeof cupomGanho === "string" &&
        cupomGanho.trim().length > 0 &&
        cupomGanho.trim().toLowerCase() !== "nenhum";

    if (category === "principal") {
        return hasCoupon
            ? `Fechou! Seu ${cupomGanho} ja entra no fechamento. Vou te mostrar nossos principais mais pedidos agora.`
            : "Fechou! Vou te mostrar nossos principais mais pedidos agora.";
    }

    if (category === "adicional") {
        return "Seu principal ja esta garantido. Agora vou te mostrar os adicionais que mais combinam com ele.";
    }

    return "Pedido forte desse jeito nao vai no seco. Agora vou te mostrar as bebidas que mais saem com ele.";
}

function coerceAvailability(
    availability?: Partial<CategoryAvailability> | null
): CategoryAvailability {
    return {
        principal: availability?.principal !== false,
        adicional: availability?.adicional !== false,
        bebida: availability?.bebida !== false,
    };
}

function pickAvailableCategory(
    availability: CategoryAvailability,
    preferred: Array<"principal" | "adicional" | "bebida">
) {
    for (const category of preferred) {
        if (availability[category]) {
            return category;
        }
    }
    return null;
}

export function resolveCategoryForPlaybook(details: {
    requestedCategory: "principal" | "adicional" | "bebida";
    preferredDomain?: SalesDomain;
    availability?: Partial<CategoryAvailability> | null;
    hasPrincipal?: boolean;
    hasAdditional?: boolean;
    hasDrink?: boolean;
}) {
    const availability = coerceAvailability(details.availability);
    const preferredDomain = details.preferredDomain || "generic";

    if (
        preferredDomain === "acai" &&
        details.requestedCategory === "bebida"
    ) {
        return (
            pickAvailableCategory(availability, [
                details.hasAdditional ? "principal" : "adicional",
                "principal",
                "adicional",
            ]) || "principal"
        );
    }

    if (availability[details.requestedCategory]) {
        return details.requestedCategory;
    }

    if (preferredDomain === "acai") {
        return (
            pickAvailableCategory(availability, ["adicional", "principal"]) ||
            details.requestedCategory
        );
    }

    return (
        pickAvailableCategory(availability, ["adicional", "bebida", "principal"]) ||
        details.requestedCategory
    );
}

function inferCategoryFromOfferText(text: string): "principal" | "adicional" | "bebida" | null {
    if (/(bebida|refrigerante|suco|agua|cha|guarana|coca)/.test(text)) {
        return "bebida";
    }
    if (/(adicional|acompanh|extra|complemento|batata|anel de cebola)/.test(text)) {
        return "adicional";
    }
    if (/(principal|lanche|burger|hamburg|pizza|sushi|cardapio)/.test(text)) {
        return "principal";
    }
    return null;
}

export function detectSalesObjectionIntent(details: SalesObjectionContext) {
    if (details.hasPaymentMethod || details.hasOrder) {
        return null;
    }

    const inbound = normalizeLooseText(details.latestInboundText);
    if (!inbound) {
        return null;
    }

    const hasObjectionSignal =
        /(so tem isso|so isso|tem mais|mais opc|outra opc|outro opc|mais barato|mais em conta|ta caro|caro|muito caro|valor alto|preco alto)/.test(
            inbound
        );

    if (!hasObjectionSignal) {
        return null;
    }

    const outbound = normalizeLooseText(details.latestOutboundText);
    let category = outbound ? inferCategoryFromOfferText(outbound) : null;
    const preferredDomain = details.preferredDomain || "generic";
    const availability = coerceAvailability(details.availability);

    if (!category) {
        if (preferredDomain === "acai") {
            category = !details.hasAdditional
                ? pickAvailableCategory(availability, ["adicional", "principal"])
                : pickAvailableCategory(availability, ["principal", "adicional"]);
        } else if (!details.hasPrincipal) {
            category = pickAvailableCategory(availability, ["principal", "adicional", "bebida"]);
        } else if (!details.hasAdditional) {
            category = pickAvailableCategory(availability, ["adicional", "bebida", "principal"]);
        } else if (!details.hasDrink) {
            category = pickAvailableCategory(availability, ["bebida", "adicional", "principal"]);
        } else if (details.hasCartItems) {
            category = pickAvailableCategory(availability, ["adicional", "bebida", "principal"]);
        } else {
            category = pickAvailableCategory(availability, ["principal", "adicional", "bebida"]);
        }
    }

    if (!category) {
        category = "principal";
    }
    category = resolveCategoryForPlaybook({
        requestedCategory: category,
        preferredDomain,
        availability,
        hasPrincipal: details.hasPrincipal,
        hasAdditional: details.hasAdditional,
        hasDrink: details.hasDrink,
    });

    const isPriceObjection = /(mais barato|mais em conta|ta caro|caro|muito caro|valor alto|preco alto)/.test(
        inbound
    );

    return {
        category,
        isPriceObjection,
    } as const;
}

export function buildObjectionRecoveryPitch(details: {
    category: "principal" | "adicional" | "bebida";
    isPriceObjection: boolean;
    cupomGanho?: string | null;
}) {
    const hasCoupon =
        typeof details.cupomGanho === "string" &&
        details.cupomGanho.trim().length > 0 &&
        details.cupomGanho.trim().toLowerCase() !== "nenhum";
    const couponTail = hasCoupon
        ? ` Seu ${details.cupomGanho} segue ativo no fechamento.`
        : "";

    if (details.isPriceObjection) {
        if (details.category === "principal") {
            return `Fechou, vou te mostrar principais mais em conta agora.${couponTail}`.trim();
        }
        if (details.category === "adicional") {
            return `Boa, vou te mostrar adicionais mais leves pro bolso agora.${couponTail}`.trim();
        }
        return `Perfeito, vou te mostrar bebidas com melhor custo-beneficio agora.${couponTail}`.trim();
    }

    if (details.category === "principal") {
        return "Tem sim. Vou abrir mais opcoes de principais agora pra voce escolher o melhor.";
    }
    if (details.category === "adicional") {
        return "Tem sim. Vou abrir mais opcoes de adicionais que combinam com seu pedido.";
    }
    return "Tem sim. Vou abrir mais opcoes de bebidas pra fechar seu pedido redondo.";
}

function inferSalesDomainFromContextText(text: string): SalesDomain {
    const normalized = normalizeLooseText(text);
    if (!normalized) {
        return "generic";
    }
    if (/(acai|açai|açaí|creme|tigela)/.test(normalized)) {
        return "acai";
    }
    if (/(pizza|calabresa|marguerita|portuguesa|quatro queijos|4 queijos)/.test(normalized)) {
        return "pizza";
    }
    if (/(sushi|temaki|uramaki|hossomaki|sashimi|niguiri|nigiri|hot roll)/.test(normalized)) {
        return "sushi";
    }
    if (/(burger|hamburg|x-|smash|lanche|bacon monster|cheese salada|cheddar|chicken crisp)/.test(normalized)) {
        return "burger";
    }
    return "generic";
}

function hasPizzaSizeToken(text: string) {
    const normalized = normalizeLooseText(text);
    if (!normalized) return false;
    return /(media|m[eé]dia|grande|gigante|brotinho|familia|fam[ií]lia|individual|pequena|pequeno)/.test(
        normalized
    );
}

export function inferSalesDomainFromProductName(productName: string): SalesDomain {
    return inferSalesDomainFromContextText(productName);
}

export function buildPostAddToCartSalesPlan(details: {
    addedCategory: "principal" | "adicional" | "bebida";
    addedProductName: string;
    latestOutboundText: string;
    hasAdditional: boolean;
    hasDrink: boolean;
    preferredDomain?: SalesDomain;
    availability?: Partial<CategoryAvailability> | null;
}) {
    const availability = coerceAvailability(details.availability);
    const explicitDomain = inferSalesDomainFromProductName(details.addedProductName);
    const hintedDomain = details.preferredDomain && details.preferredDomain !== "generic"
        ? details.preferredDomain
        : explicitDomain !== "generic"
            ? explicitDomain
            : inferSalesDomainFromContextText(details.latestOutboundText);

    if (details.addedCategory === "bebida") {
        return {
            nextCategory: null,
            searchQuery: null,
            followupText: `Fechou! Adicionei ${details.addedProductName}.\nSe for so isso, me fala e eu ja te peco a localizacao.`,
            domain: hintedDomain,
        } as const;
    }

    if (hintedDomain === "pizza") {
        if (
            details.addedCategory === "principal" &&
            availability.principal &&
            !hasPizzaSizeToken(details.addedProductName)
        ) {
            return {
                nextCategory: "principal" as const,
                searchQuery: "pizza media grande gigante",
                followupText:
                    "Perfeito! Agora escolhe o tamanho da pizza: media, grande ou gigante. Ja te mostro as opcoes.",
                domain: hintedDomain,
            } as const;
        }

        if (!details.hasAdditional) {
            const nextCategory = pickAvailableCategory(availability, [
                "adicional",
                "principal",
                "bebida",
            ]);
            if (!nextCategory) {
                return {
                    nextCategory: null,
                    searchQuery: null,
                    followupText:
                        `Fechou! Adicionei ${details.addedProductName}.\nSe for so isso, me fala e eu ja te peco a localizacao.`,
                    domain: hintedDomain,
                } as const;
            }
            return {
                nextCategory,
                searchQuery: null,
                followupText: nextCategory === "adicional"
                    ? "Pizza no carrinho! Agora ja te mostro os adicionais que mais saem para turbinar seu pedido."
                    : "Pizza no carrinho! Agora ja te mostro mais opcoes de pizza pra fechar no melhor formato.",
                domain: hintedDomain,
            } as const;
        }

        if (!details.hasDrink) {
            const nextCategory = pickAvailableCategory(availability, [
                "bebida",
                "adicional",
                "principal",
            ]);
            if (!nextCategory) {
                return {
                    nextCategory: null,
                    searchQuery: null,
                    followupText:
                        `Fechou! Adicionei ${details.addedProductName}.\nSe for so isso, me fala e eu ja te peco a localizacao.`,
                    domain: hintedDomain,
                } as const;
            }
            return {
                nextCategory,
                searchQuery: null,
                followupText: nextCategory === "bebida"
                    ? "Pizza no esquema! Agora ja te mostro as bebidas pra acompanhar."
                    : "Pizza no esquema! Agora ja te mostro os complementos que mais saem com esse pedido.",
                domain: hintedDomain,
            } as const;
        }

        return {
            nextCategory: null,
            searchQuery: null,
            followupText:
                `Fechou! Adicionei ${details.addedProductName}.\nSe for so isso, me fala e eu ja te peco a localizacao.`,
            domain: hintedDomain,
        } as const;
    }

    if (hintedDomain === "acai") {
        if (!details.hasAdditional && availability.adicional) {
            return {
                nextCategory: "adicional" as const,
                searchQuery: null,
                followupText:
                    `Top! Adicionei ${details.addedProductName}.\nAgora ja te mostro os complementos pra montar seu acai do seu jeito.`,
                domain: hintedDomain,
            } as const;
        }

        const nextCategory = pickAvailableCategory(availability, ["principal", "adicional"]);
        if (!nextCategory) {
            return {
                nextCategory: null,
                searchQuery: null,
                followupText:
                    `Fechou! Adicionei ${details.addedProductName}.\nSe for so isso, me fala e eu ja te peco a localizacao.`,
                domain: hintedDomain,
            } as const;
        }
        return {
            nextCategory,
            searchQuery: nextCategory === "principal" ? "acai" : null,
            followupText: nextCategory === "principal"
                ? "Boa! Quer aproveitar e levar mais um acai? Ja te mostro as opcoes que mais saem."
                : "Boa! Ja te mostro mais complementos pra deixar seu acai ainda melhor.",
            domain: hintedDomain,
        } as const;
    }

    if (hintedDomain === "sushi") {
        if (!details.hasAdditional) {
            const nextCategory = pickAvailableCategory(availability, [
                "adicional",
                "bebida",
                "principal",
            ]);
            if (!nextCategory) {
                return {
                    nextCategory: null,
                    searchQuery: null,
                    followupText:
                        `Fechou! Adicionei ${details.addedProductName}.\nSe for so isso, me fala e eu ja te peco a localizacao.`,
                    domain: hintedDomain,
                } as const;
            }
            return {
                nextCategory,
                searchQuery: null,
                followupText: nextCategory === "adicional"
                    ? `Perfeito! Adicionei ${details.addedProductName}.\nAgora ja te mostro adicionais e entradas pra completar seu combinado.`
                    : `Perfeito! Adicionei ${details.addedProductName}.\nAgora ja te mostro as melhores opcoes para acompanhar seu combinado.`,
                domain: hintedDomain,
            } as const;
        }

        if (!details.hasDrink) {
            const nextCategory = pickAvailableCategory(availability, [
                "bebida",
                "adicional",
                "principal",
            ]);
            if (!nextCategory) {
                return {
                    nextCategory: null,
                    searchQuery: null,
                    followupText:
                        `Fechou! Adicionei ${details.addedProductName}.\nSe for so isso, me fala e eu ja te peco a localizacao.`,
                    domain: hintedDomain,
                } as const;
            }
            return {
                nextCategory,
                searchQuery: null,
                followupText: nextCategory === "bebida"
                    ? `Fechou! Adicionei ${details.addedProductName}.\nAgora ja te mostro as bebidas pra acompanhar.`
                    : `Fechou! Adicionei ${details.addedProductName}.\nAgora ja te mostro adicionais para fechar esse pedido redondo.`,
                domain: hintedDomain,
            } as const;
        }

        return {
            nextCategory: null,
            searchQuery: null,
            followupText:
                `Fechou! Adicionei ${details.addedProductName}.\nSe for so isso, me fala e eu ja te peco a localizacao.`,
            domain: hintedDomain,
        } as const;
    }

    if (!details.hasAdditional) {
        const nextCategory = pickAvailableCategory(availability, [
            "adicional",
            "bebida",
            "principal",
        ]);
        if (!nextCategory) {
            return {
                nextCategory: null,
                searchQuery: null,
                followupText:
                    `Fechou! Adicionei ${details.addedProductName}.\nSe for so isso, me fala e eu ja te peco a localizacao.`,
                domain: hintedDomain,
            } as const;
        }
        return {
            nextCategory,
            searchQuery: null,
            followupText: nextCategory === "adicional"
                ? `Perfeito! Adicionei ${details.addedProductName} ao seu pedido.\nSeu principal ja ficou no carrinho. Agora ja te mostro os adicionais mais pedidos.`
                : nextCategory === "bebida"
                    ? `Perfeito! Adicionei ${details.addedProductName} ao seu pedido.\nAgora ja te mostro as bebidas para acompanhar.`
                    : `Perfeito! Adicionei ${details.addedProductName} ao seu pedido.\nAgora ja te mostro mais principais para reforcar o pedido.`,
            domain: hintedDomain,
        } as const;
    }

    if (!details.hasDrink) {
        const nextCategory = pickAvailableCategory(availability, [
            "bebida",
            "adicional",
            "principal",
        ]);
        if (!nextCategory) {
            return {
                nextCategory: null,
                searchQuery: null,
                followupText:
                    `Fechou! Adicionei ${details.addedProductName}.\nSe for so isso, me fala e eu ja te peco a localizacao.`,
                domain: hintedDomain,
            } as const;
        }
        return {
            nextCategory,
            searchQuery: null,
            followupText: nextCategory === "bebida"
                ? `Fechou! Adicionei ${details.addedProductName}.\nPedido forte desse jeito nao vai no seco. Agora ja te mostro as bebidas.`
                : nextCategory === "adicional"
                    ? `Fechou! Adicionei ${details.addedProductName}.\nAgora ja te mostro os adicionais que mais saem com esse pedido.`
                    : `Fechou! Adicionei ${details.addedProductName}.\nAgora ja te mostro mais principais para reforcar o pedido.`,
            domain: hintedDomain,
        } as const;
    }

    return {
        nextCategory: null,
        searchQuery: null,
        followupText:
            `Fechou! Adicionei ${details.addedProductName}.\nSe for so isso, me fala e eu ja te peco a localizacao.`,
        domain: hintedDomain,
    } as const;
}

export function shouldAutoCalculateAfterOperationalInput(
    details: AutoCalculateAfterOperationalInputContext
) {
    if (
        !details.receivedOperationalInput ||
        !details.hasCartItems ||
        details.hasPaymentMethod ||
        details.hasOrder
    ) {
        return false;
    }

    if (
        !details.locationConfirmed ||
        !details.addressConfirmed ||
        !details.referenceConfirmed
    ) {
        return false;
    }

    const latestOutboundNormalized = normalizeLooseText(details.latestOutboundText);
    if (!latestOutboundNormalized) {
        return false;
    }

    const askedForOperationalData =
        /(localizacao|gps|compartilh)/.test(latestOutboundNormalized) ||
        /(numero da casa|numero do endereco|numero do local)/.test(
            latestOutboundNormalized
        ) ||
        /(ponto de referencia|referencia para eu seguir|me manda um ponto de referencia)/.test(
            latestOutboundNormalized
        );

    return askedForOperationalData;
}
