/**
 * Conversation Analyzer Module
 *
 * All functions that analyze conversation context, detect patterns,
 * and build the operational chat summary. These are "read-only" —
 * they inspect data but never write to DB or call external APIs.
 */

import { Content } from "@google/generative-ai";
import {
    deriveExplicitCommercialState,
    determineRecommendedCommercialObjective,
    readCartSnapshotMeta,
} from "./heuristics";
import { getContentText } from "./gemini-client";
import type { PrefixCacheMode } from "./orchestrator-types";
import { ENABLED_MODE_RECENT_CONTEXT_LIMIT } from "./orchestrator-types";
import { asRecord } from "./orchestrator-utils";

// ---------------------------------------------------------------------------
// Cart Summary
// ---------------------------------------------------------------------------

export function formatCartSnapshotSummary(snapshot: unknown) {
    const meta = readCartSnapshotMeta(snapshot);
    if (!meta.hasItems && !meta.hasOrder) return "nenhum";

    const parts = [
        `itens=${meta.itemCount}`,
        `subtotal=${meta.subtotal.toFixed(2)}`,
        `desconto=${meta.discount.toFixed(2)}`,
        `frete=${meta.deliveryFee.toFixed(2)}`,
        `total=${meta.total.toFixed(2)}`,
        `mix=${[
            meta.hasPrincipal ? "principal" : null,
            meta.hasAdditional ? "adicional" : null,
            meta.hasDrink ? "bebida" : null,
        ].filter(Boolean).join("+") || "indefinido"}`,
        `pagamento=${meta.paymentMethod}`,
        `fonte=${meta.source}`,
        `status=${meta.status}`,
    ];

    if (meta.orderId) parts.push(`order_id=${meta.orderId}`);
    return parts.join(",");
}

// ---------------------------------------------------------------------------
// Commercial Phase
// ---------------------------------------------------------------------------

export function inferCommercialPhase(details: {
    latestInboundText: string;
    previousAssistantText: string;
    pendingSteps: string[];
    hasCupom: boolean;
}) {
    const latestInboundNormalized = details.latestInboundText.toLowerCase();
    const previousAssistantNormalized = details.previousAssistantText.toLowerCase();

    if (details.pendingSteps.length > 0) return "coleta_dados_entrega";

    if (/(pix|pagamento|pagar|dinheiro|cartao|cr[eé]dito|d[eé]bito)/i.test(latestInboundNormalized))
        return "pagamento";

    if (
        /(client_action:add_to_cart|quero|vou querer|pode mandar|fechar pedido|finalizar|confirmo)/i.test(
            latestInboundNormalized
        )
    )
        return "fechamento";

    if (
        /(card[aá]pio|op[cç][aã]o|opcoes|escolha|combo|adicional|bebida|carrossel)/i.test(
            previousAssistantNormalized
        )
    )
        return "oferta_produtos";

    if (details.hasCupom) return "oferta_com_cupom";
    return "atendimento_ativo";
}

// ---------------------------------------------------------------------------
// Post-Location Follow-Up
// ---------------------------------------------------------------------------

export function buildPostLocationFollowUpMessage(details: {
    incomingHasLocation: boolean;
    addressConfirmed: boolean;
    referenceConfirmed: boolean;
}) {
    if (!details.incomingHasLocation) return null;
    if (!details.addressConfirmed && !details.referenceConfirmed)
        return "Perfeito. Agora me manda o numero da casa e um ponto de referencia para eu seguir.";
    if (!details.addressConfirmed)
        return "Perfeito. Agora me manda o numero da casa para eu seguir.";
    if (!details.referenceConfirmed)
        return "Perfeito. Agora me manda um ponto de referencia para eu seguir.";
    return null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatCurrency(value: unknown) {
    const numeric = Number(value);
    const safeValue = Number.isFinite(numeric) ? numeric : 0;
    return `R$ ${safeValue.toFixed(2).replace(".", ",")}`;
}

export function buildCartTotalSummaryText(result: Record<string, unknown>) {
    const subtotal = Number(result.subtotal);
    const discount = Number(result.discount);
    const deliveryFee = Number(result.delivery_fee);
    const total = Number(result.total);

    return [
        `Perfeito! Subtotal: ${formatCurrency(subtotal)}.`,
        `Desconto: ${formatCurrency(discount)}. Frete: ${formatCurrency(deliveryFee)}.`,
        `Total com entrega: ${formatCurrency(total)}.`,
    ].join(" ");
}

// ---------------------------------------------------------------------------
// Sales Signal Detection
// ---------------------------------------------------------------------------

export function extractSalesSignals(conversationContext: Content[]) {
    const recentContext = conversationContext.slice(-6);
    const assistantTexts = recentContext
        .filter((message) => message.role === "model")
        .map((message) => getContentText(message).toLowerCase())
        .filter(Boolean);
    const userTexts = recentContext
        .filter((message) => message.role === "user")
        .map((message) => getContentText(message).toLowerCase())
        .filter(Boolean);

    const offeredAdditional = assistantTexts.some((text) =>
        /(adicional|extra|acrescentar|complemento|borda|molho)/i.test(text)
    );
    const offeredDrink = assistantTexts.some((text) =>
        /(bebida|refrigerante|suco|agua|coca|guarana)/i.test(text)
    );
    const closeAttemptStarted =
        assistantTexts.some((text) =>
            /(fechar pedido|finalizar pedido|confirmar pedido|forma de pagamento|pagamento)/i.test(text)
        ) ||
        userTexts.some((text) =>
            /(vou querer|quero esse|pode mandar|fechar pedido|finalizar|confirmo)/i.test(text)
        );
    const customerRejectedOffer = userTexts.some((text) =>
        /(nao quero|não quero|nao precisa|não precisa|dispenso|talvez depois|deixa sem|sem\b)/i.test(text)
    );

    return {
        offeredAdditional,
        offeredDrink,
        closeAttemptStarted,
        customerRejectedOffer,
    };
}

// ---------------------------------------------------------------------------
// Sentiment Detection
// ---------------------------------------------------------------------------

export function detectSentiment(conversationContext: Content[]): "Satisfeito" | "Frustrado" | "Neutro" {
    const userTexts = conversationContext
        .filter((m) => m.role === "user")
        .slice(-3) // Analisar as últimas 3 mensagens do usuário
        .map((m) => getContentText(m).toLowerCase());

    if (userTexts.length === 0) return "Neutro";

    const positivePatterns = [
        "obrigado", "valeu", "show", "otimo", "ótimo", "perfeito", "amei",
        "top", "bom demais", "legal", "obrigada", "excelente", "com certeza"
    ];

    const negativePatterns = [
        "demora", "demorando", "errado", "ruim", "pessimo", "péssimo",
        "horrivel", "horrível", "lento", "esperando", "atraso", "absurdo",
        "nao aguento", "não aguento", "lixo", "caro", "dificil", "difícil"
    ];

    let positiveScore = 0;
    let negativeScore = 0;

    userTexts.forEach(text => {
        positivePatterns.forEach(p => { if (text.includes(p)) positiveScore++; });
        negativePatterns.forEach(p => { if (text.includes(p)) negativeScore++; });
    });

    if (negativeScore > positiveScore) return "Frustrado";
    if (positiveScore > 0) return "Satisfeito";
    return "Neutro";
}

// ---------------------------------------------------------------------------
// Offer Repetition Detection
// ---------------------------------------------------------------------------

export function detectOfferRepetition(conversationContext: Content[]) {
    const assistantTexts = conversationContext
        .slice(-6)
        .filter((message) => message.role === "model")
        .map((message) => getContentText(message).toLowerCase())
        .filter(Boolean);

    const offerKinds = assistantTexts
        .map((text) => {
            if (/(adicional|extra|acrescentar|complemento|borda|molho)/i.test(text)) return "adicional";
            if (/(bebida|refrigerante|suco|agua|coca|guarana)/i.test(text)) return "bebida";
            if (/(combo|card[aá]pio|op[cç][aã]o|opcoes|escolha|carrossel)/i.test(text)) return "catalogo";
            if (/(fechar pedido|finalizar pedido|confirmar pedido|forma de pagamento|pagamento)/i.test(text))
                return "fechamento";
            return null;
        })
        .filter((kind): kind is NonNullable<typeof kind> => kind !== null);

    const lastOfferKind = offerKinds[offerKinds.length - 1] || null;
    const repeatedOfferKind =
        offerKinds.length >= 2 && offerKinds[offerKinds.length - 1] === offerKinds[offerKinds.length - 2]
            ? offerKinds[offerKinds.length - 1]
            : null;

    return { lastOfferKind, repeatedOfferKind };
}

// ---------------------------------------------------------------------------
// Resumption & Intent Detection
// ---------------------------------------------------------------------------

export function detectResumptionSignal(details: {
    latestInboundText: string;
    conversationContext: Content[];
}) {
    const latestInboundNormalized = details.latestInboundText.toLowerCase();
    const recentAssistantTexts = details.conversationContext
        .slice(-6)
        .filter((message) => message.role === "model")
        .map((message) => getContentText(message).toLowerCase())
        .filter(Boolean);

    const mentionsResume =
        /(voltei|voltando|quero continuar|continuar pedido|continuar|retomar|ainda quero|vamos seguir)/i.test(
            latestInboundNormalized
        );
    const mentionsConfirmation =
        /(sim|ok|pode|bora|manda|quero|confirmo|fechar)/i.test(latestInboundNormalized);
    const followupPromptSeen = recentAssistantTexts.some((text) =>
        /(lembrete|retomando|continuar seu pedido|posso seguir|ainda tem interesse|posso te ajudar a concluir)/i.test(text)
    );
    const cartPromptSeen = recentAssistantTexts.some((text) =>
        /(carrinho|seu pedido|finalizar pedido|fechar pedido|pagamento)/i.test(text)
    );

    if ((mentionsResume || mentionsConfirmation) && followupPromptSeen) return "resposta_a_followup";
    if ((mentionsResume || mentionsConfirmation) && cartPromptSeen) return "retomada_carrinho";
    if (/(oi|ola|olá|bom dia|boa tarde|boa noite)/i.test(latestInboundNormalized)) return "nova_interacao";
    return "continuidade_normal";
}

export function detectTextRepetitionPattern(conversationContext: Content[]) {
    const assistantTexts = conversationContext
        .slice(-6)
        .filter((message) => message.role === "model")
        .map((message) => getContentText(message).trim().toLowerCase())
        .filter(Boolean);

    const normalizedAssistantTexts = assistantTexts.map((text) =>
        text.replace(/\s+/g, " ").replace(/[.!?,;:]+$/g, "").trim()
    );

    const lastAssistantText = normalizedAssistantTexts[normalizedAssistantTexts.length - 1] || null;
    const previousAssistantText = normalizedAssistantTexts[normalizedAssistantTexts.length - 2] || null;
    const exactRepeatDetected =
        Boolean(lastAssistantText) && Boolean(previousAssistantText) && lastAssistantText === previousAssistantText;
    const genericPromptRepeatDetected = normalizedAssistantTexts
        .slice(-3)
        .filter((text) =>
            /(escolha uma opcao|escolha uma opção|posso seguir|me diga como prefere|como deseja continuar)/i.test(text)
        ).length >= 2;

    return { exactRepeatDetected, genericPromptRepeatDetected };
}

export function detectDominantCustomerIntent(details: {
    latestInboundText: string;
    conversationContext: Content[];
}) {
    const latestInboundNormalized = details.latestInboundText.toLowerCase();
    const recentUserTexts = details.conversationContext
        .slice(-6)
        .filter((message) => message.role === "user")
        .map((message) => getContentText(message).toLowerCase())
        .filter(Boolean);
    const recentUserJoined = recentUserTexts.join("\n");

    if (/(quanto|preco|preço|valor|card[aá]pio|cardapio|tem|quais|qual sabor|como funciona)/i.test(latestInboundNormalized))
        return "duvida";
    if (/(nao quero|não quero|caro|muito caro|ta caro|tá caro|nao gostei|não gostei|talvez depois)/i.test(latestInboundNormalized))
        return "objecao";
    if (/(quero|vou querer|pode mandar|fechar pedido|finalizar|confirmo|sim pode|me ve|me vê)/i.test(latestInboundNormalized))
        return "compra";
    if (/(kkk|kkkk|rs|rss|blz|beleza|de boa|tudo bem|ata|entendi|hmm|hum|show|top demais|valeu)/i.test(latestInboundNormalized))
        return "conversa_fiada";
    if (/(endereco|endereço|rua|numero|número|localizacao|localização|pix|pagamento|dinheiro|cartao|cartão)/i.test(recentUserJoined))
        return "fechamento_operacional";
    if (/(oi|ola|olá|bom dia|boa tarde|boa noite)/i.test(latestInboundNormalized))
        return "saudacao";
    return "indefinida";
}

// ---------------------------------------------------------------------------
// Operational Chat Summary (the big one)
// ---------------------------------------------------------------------------

export function buildOperationalChatSummary(details: {
    kanbanStatus: string;
    cupomGanho: string;
    cartSnapshot: unknown;
    locationConfirmed: boolean;
    addressConfirmed: boolean;
    referenceConfirmed: boolean;
    latestInboundText: string;
    conversationContext: Content[];
}) {
    const lastModelMessage = [...details.conversationContext]
        .reverse()
        .find((message) => message.role === "model");
    const previousAssistantText = getContentText(lastModelMessage).slice(0, 280) || "Nenhuma resposta anterior";
    const cartSnapshotMeta = readCartSnapshotMeta(details.cartSnapshot);
    const cartSnapshotSummary = formatCartSnapshotSummary(details.cartSnapshot);
    const pendingSteps: string[] = [];

    if (!details.locationConfirmed) pendingSteps.push("solicitar_localizacao_nativa");
    if (!details.addressConfirmed) pendingSteps.push("coletar_endereco");
    if (!details.referenceConfirmed) pendingSteps.push("coletar_ponto_de_referencia");

    const nextOperationalStep = pendingSteps[0] || "seguir_fluxo_comercial_e_confirmar_pagamento_quando_cabivel";
    const hasCupom = details.cupomGanho.trim().toLowerCase() !== "nenhum";
    const commercialPhase = inferCommercialPhase({
        latestInboundText: details.latestInboundText,
        previousAssistantText,
        pendingSteps,
        hasCupom,
    });
    const salesSignals = extractSalesSignals(details.conversationContext);
    const offerRepetition = detectOfferRepetition(details.conversationContext);
    const resumptionSignal = detectResumptionSignal({
        latestInboundText: details.latestInboundText,
        conversationContext: details.conversationContext,
    });
    const dominantCustomerIntent = detectDominantCustomerIntent({
        latestInboundText: details.latestInboundText,
        conversationContext: details.conversationContext,
    });
    const textRepetition = detectTextRepetitionPattern(details.conversationContext);
    const activeSalesSignals = [
        salesSignals.offeredAdditional ? "adicional_ja_ofertado" : null,
        salesSignals.offeredDrink ? "bebida_ja_ofertada" : null,
        salesSignals.closeAttemptStarted ? "tentativa_de_fechamento_iniciada" : null,
        salesSignals.customerRejectedOffer ? "cliente_recusou_alguma_oferta" : null,
        offerRepetition.lastOfferKind ? `ultima_oferta_${offerRepetition.lastOfferKind}` : null,
        offerRepetition.repeatedOfferKind
            ? `risco_repeticao_oferta_${offerRepetition.repeatedOfferKind}`
            : null,
        textRepetition.exactRepeatDetected ? "risco_repeticao_texto_exato" : null,
        textRepetition.genericPromptRepeatDetected ? "risco_repeticao_prompt_generico" : null,
        cartSnapshotMeta.hasItems ? "carrinho_com_itens" : null,
        cartSnapshotMeta.hasPrincipal ? "carrinho_tem_principal" : null,
        cartSnapshotMeta.hasAdditional ? "carrinho_tem_adicional" : null,
        cartSnapshotMeta.hasDrink ? "carrinho_tem_bebida" : null,
        cartSnapshotMeta.hasPaymentMethod ? `pagamento_${cartSnapshotMeta.paymentMethod}` : null,
        cartSnapshotMeta.hasOrder ? "pedido_ja_registrado" : null,
    ].filter((signal): signal is string => Boolean(signal));
    const baseRecommendedCommercialObjective = determineRecommendedCommercialObjective({
        pendingSteps,
        commercialPhase,
        resumptionSignal,
        dominantCustomerIntent,
        cartSnapshotMeta,
        salesSignals,
    });
    const explicitCommercialState = deriveExplicitCommercialState({
        pendingSteps,
        commercialPhase,
        resumptionSignal,
        dominantCustomerIntent,
        cartSnapshotMeta,
        salesSignals,
    });
    const recommendedCommercialObjective =
        offerRepetition.repeatedOfferKind === "adicional"
            ? "variar_oferta_e_tentar_bebida_ou_avancar"
            : offerRepetition.repeatedOfferKind === "bebida"
                ? "variar_oferta_e_tentar_fechamento"
                : offerRepetition.repeatedOfferKind === "catalogo"
                    ? "reduzir_opcoes_e_recomendar_item_objetivo"
                    : baseRecommendedCommercialObjective;
    const recommendedResponseStyle =
        textRepetition.exactRepeatDetected || textRepetition.genericPromptRepeatDetected
            ? "varie_a_formulacao_e_evite_repetir_frases_recentes"
            : "mantenha_resposta_curta_clara_e_objetiva";
    const executionPolicy =
        "acao_global: seja_vendedor_ativo_faca_upsell_ou_cross_sell; obrigatorio: use_botoes_nativos_para_escolhas_e_ofertas_extras_para_facilitar_o_sim; restricoes: nao_invente_produtos_precos_ou_frete; use_tool_para_dados_fatuais; resolva_pendencias_antes_de_cobrar";

    return [
        "[Resumo operacional do chat]",
        `kanban_status=${details.kanbanStatus}`,
        `fase_comercial=${commercialPhase}`,
        `estado_comercial_explicito=${explicitCommercialState}`,
        `sinal_retomada=${resumptionSignal}`,
        `sinal_intencao_cliente=${dominantCustomerIntent}`,
        `cupom_ganho=${details.cupomGanho}`,
        `cupom_ativo=${hasCupom ? "sim" : "nao"}`,
        `cart_snapshot=${cartSnapshotSummary}`,
        `cart_status=${cartSnapshotMeta.status}`,
        `location_confirmed=${details.locationConfirmed ? "sim" : "nao"}`,
        `address_confirmed=${details.addressConfirmed ? "sim" : "nao"}`,
        `reference_confirmed=${details.referenceConfirmed ? "sim" : "nao"}`,
        `sinais_venda=${activeSalesSignals.length > 0 ? activeSalesSignals.join(",") : "nenhum"}`,
        `pendencias_operacionais=${pendingSteps.length > 0 ? pendingSteps.join(",") : "nenhuma"}`,
        `proxima_acao_operacional=${nextOperationalStep}`,
        `objetivo_comercial_recomendado=${recommendedCommercialObjective}`,
        `estilo_resposta_recomendado=${recommendedResponseStyle}`,
        `politica_execucao=${executionPolicy}`,
        `ultima_mensagem_cliente=${details.latestInboundText || "Nenhuma"}`,
        `ultima_resposta_assistente=${previousAssistantText}`,
        "Para catalogo, precos, frete, desconto e cobranca, consulte dados reais via tool antes de afirmar qualquer valor ou disponibilidade.",
        "Regra absoluta: produto so existe se vier com product_id em search_product_catalog; se nao vier, nao existe e nao pode ser citado.",
        "Regra absoluta de horario/status da loja: use somente get_store_info (is_open_now/business_hours). Nunca invente abertura ou fechamento.",
        "Se houver pendencias operacionais, resolva antes de calcular frete, cobrar ou finalizar pedido.",
        "Se objetivo_comercial_recomendado indicar variar abordagem, nao repita a mesma oferta ou a mesma frase recente.",
        "Use este resumo para manter contexto. Se houver divergencia, priorize a mensagem mais recente do cliente.",
    ].join("\n");
}

// ---------------------------------------------------------------------------
// Context Optimization
// ---------------------------------------------------------------------------

export function optimizeConversationContext(
    conversationContext: Content[],
    operationalSummary: string,
    prefixCacheMode: PrefixCacheMode
) {
    if (prefixCacheMode !== "enabled") return conversationContext;

    const recentContext = conversationContext.slice(-ENABLED_MODE_RECENT_CONTEXT_LIMIT);
    return [
        { role: "user", parts: [{ text: operationalSummary }] },
        ...recentContext,
    ];
}

// ---------------------------------------------------------------------------
// Address / Reference Detection
// ---------------------------------------------------------------------------

export function looksLikeAddress(text: string) {
    const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!normalized.trim()) return false;

    const streetHints = [
        "rua", "r.", "avenida", "av.", "av ", "travessa", "tv.", "alameda",
        "bairro", "numero", "n ", "cep", "quadra", "lote",
    ];

    if (streetHints.some((hint) => normalized.includes(hint))) return true;

    const trimmed = normalized.trim();
    const quantityLikePattern = /^\d{1,3}\s+(?:dele|dela|deles|delas|disso|desse|deste|dessa|x)\b/i;
    if (quantityLikePattern.test(trimmed)) return false;
    if (/^\d{1,5}[a-z]?$/i.test(trimmed)) return true;

    const addressDetailHints = [
        "casa", "apto", "apartamento", "bloco", "esquina", "portao",
        "fundos", "residencial", "condominio", "lote", "quadra",
    ];
    const startsWithHouseNumberAndDetails =
        /^\d{1,5}[a-z]?(?:\s+[a-z0-9-]+){1,}$/i.test(trimmed) &&
        addressDetailHints.some((hint) => trimmed.includes(hint));

    if (startsWithHouseNumberAndDetails) return true;

    const streetPattern = /\b(?:rua|avenida|av\.?|travessa|tv\.?|alameda|bairro|quadra|lote)\b.*\d{1,5}/i;
    const reverseStreetPattern = /\d{1,5}.*\b(?:rua|avenida|av\.?|travessa|tv\.?|alameda|bairro|quadra|lote)\b/i;

    return streetPattern.test(trimmed) || reverseStreetPattern.test(trimmed);
}

export function looksLikeReference(text: string) {
    const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const refHints = [
        "perto de", "ao lado de", "em frente a", "proximo a", "esquina",
        "portao", "casa", "loja", "mercado", "farmacia", "posto",
        "predio", "bloco", "apto", "apartamento", "residencial", "condominio",
    ];

    return refHints.some((hint) => normalized.includes(hint));
}

export function extractOperationalInputParts(text: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith("client_action:location_shared ")) {
        return { addressText: "", referenceText: "" };
    }

    const quantityLikePattern = /^\d{1,3}\s+(?:dele|dela|deles|delas|disso|desse|deste|dessa|x)\b/i;
    if (quantityLikePattern.test(trimmed)) {
        return { addressText: "", referenceText: "" };
    }

    const leadingNumberMatch = trimmed.match(/^(\d{1,5}[a-z]?)\b(?:\s+(.*))?$/i);
    if (leadingNumberMatch) {
        const addressText = leadingNumberMatch[1]?.trim() || "";
        const trailingText = leadingNumberMatch[2]?.trim() || "";
        return { addressText, referenceText: trailingText };
    }

    return {
        addressText: looksLikeAddress(trimmed) ? trimmed : "",
        referenceText: looksLikeReference(trimmed) ? trimmed : "",
    };
}

export function hasNativeLocation(payload: unknown, text?: string | null) {
    const lowerText = String(text || "").toLowerCase();
    if (lowerText.startsWith("client_action:location_shared ")) return true;

    const payloadRecord = asRecord(payload);
    const bodyRecord = asRecord(payloadRecord?.BODY);
    const msg = asRecord(bodyRecord?.message) || asRecord(payloadRecord?.message);
    const content = asRecord(msg?.content);
    const lat = content?.degreesLatitude;
    const lng = content?.degreesLongitude;
    const messageType = msg?.messageType;

    return (
        messageType === "LocationMessage" &&
        typeof lat === "number" &&
        typeof lng === "number"
    );
}

// ---------------------------------------------------------------------------
// Store Open Check
// ---------------------------------------------------------------------------

export { isStoreOpenForCheckout };

import { executeAiTool, ToolContext } from "./toolHandler";

async function isStoreOpenForCheckout(ctx: ToolContext) {
    try {
        const storeInfoRaw = await executeAiTool("get_store_info", {}, ctx);
        const storeInfoResult = asRecord(JSON.parse(storeInfoRaw));
        const storeInfo = asRecord(storeInfoResult?.store_info);
        return storeInfo?.is_open_now === true;
    } catch {
        return true;
    }
}
