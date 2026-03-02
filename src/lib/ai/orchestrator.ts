import {
    GoogleGenerativeAI,
    Content,
    FunctionCallPart,
    FunctionResponsePart,
    Part,
} from "@google/generative-ai";
import { executeAiTool, ToolContext } from "./toolHandler";
import { createClient } from "@supabase/supabase-js";
import { mapOpenAIToolsToGemini } from "./geminiMapper";
import {
    determineRecommendedCommercialObjective,
    readCartSnapshotMeta,
} from "./heuristics";
import {
    detectUnverifiedCommercialClaim,
    normalizeOutboundText,
    stripThoughtBlocks,
} from "./orchestratorRules";
import openaiTools from "./tools.json";

type OpenAIToolDefinition = {
    type: string;
    function: {
        name: string;
        description: string;
        parameters?: Record<string, unknown>;
    };
};
type StoredMessage = {
    direction: string;
    text: string | null;
    payload: unknown;
    created_at?: string | null;
};
type KanbanStageRelation = { name?: string | null };
type ChatContextRecord = {
    stage_id?: string | null;
    kanban_status?: string | null;
    cupom_ganho?: string | null;
    cart_snapshot?: unknown;
    kanban_stages?: KanbanStageRelation | KanbanStageRelation[] | null;
};
type PixPayload = {
    number?: string;
    amount?: number;
    text?: string;
    pixKey?: string;
    pixType?: string;
};

const GEMINI_TOOLS = mapOpenAIToolsToGemini(openaiTools as OpenAIToolDefinition[]);
const GEMINI_MODEL_NAME = "gemini-2.5-flash";
const MODEL_CACHE_LIMIT = 32;
const MODEL_CACHE = new Map<string, ReturnType<GoogleGenerativeAI["getGenerativeModel"]>>();
const GEMINI_REQUEST_TIMEOUT_MS = 20000;
const UAZAPI_REQUEST_TIMEOUT_MS = 10000;
const ENABLED_MODE_RECENT_CONTEXT_LIMIT = 8;

type PrefixCacheMode = "off" | "shadow" | "enabled";
type OutboundSendResult = {
    ok: boolean;
    delivered: boolean;
    status?: number;
    body?: unknown;
    error?: string;
    endpoint?: string;
};

type OrchestratorParams = {
    restaurantId: string;
    chatId: string;
    waChatId: string;
    instanceName?: string;
    incomingText: string;
};

function getSupabaseAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

function normalizeBaseUrl(url: string) {
    return url.replace(/\/$/, "");
}

function parseApiResponseBody(raw: string) {
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function logAiEvent(event: string, details: Record<string, unknown> = {}) {
    console.log("[AI OBS]", {
        event,
        at: new Date().toISOString(),
        ...details,
    });
}

async function withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
) {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race<T>([
            operation,
            new Promise<T>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new Error(timeoutMessage));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

async function fetchWithTimeout(
    input: string,
    init: RequestInit,
    timeoutMs: number
) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutHandle);
    }
}

function asRecord(value: unknown) {
    if (typeof value === "object" && value !== null) {
        return value as Record<string, unknown>;
    }

    return null;
}

function readKanbanStageName(value: ChatContextRecord["kanban_stages"]) {
    if (Array.isArray(value)) {
        const firstStage = value[0];
        return typeof firstStage?.name === "string" ? firstStage.name : null;
    }

    return typeof value?.name === "string" ? value.name : null;
}

function asPixPayload(value: unknown): PixPayload | null {
    const record = asRecord(value);
    if (!record) {
        return null;
    }

    if (!("pixKey" in record) || !("amount" in record)) {
        return null;
    }

    return {
        number: typeof record.number === "string" ? record.number : undefined,
        amount: typeof record.amount === "number" ? record.amount : Number(record.amount),
        text: typeof record.text === "string" ? record.text : undefined,
        pixKey: typeof record.pixKey === "string" ? record.pixKey : undefined,
        pixType: typeof record.pixType === "string" ? record.pixType : undefined,
    };
}

function buildPixPayloadFingerprint(payload: PixPayload) {
    return [
        payload.number || "",
        Number.isFinite(Number(payload.amount)) ? Number(payload.amount).toFixed(2) : "",
        payload.text || "",
        payload.pixKey || "",
        payload.pixType || "",
    ].join("|");
}

async function wasPixPayloadAlreadySent(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    chatId: string,
    payload: PixPayload,
    triggerMessageCreatedAt?: string
) {
    let query = supabase
        .from("messages")
        .select("payload")
        .eq("chat_id", chatId)
        .eq("direction", "out")
        .order("created_at", { ascending: false });

    if (triggerMessageCreatedAt) {
        query = query.gte("created_at", triggerMessageCreatedAt);
    }

    const { data: recentOutboundMessages } = await query.limit(20);

    const targetFingerprint = buildPixPayloadFingerprint(payload);
    return ((recentOutboundMessages || []) as Array<{ payload: unknown }>).some((message) => {
        const existingPayload = asPixPayload(message.payload);
        if (!existingPayload) {
            return false;
        }

        return buildPixPayloadFingerprint(existingPayload) === targetFingerprint;
    });
}

function getPrefixCacheMode(): PrefixCacheMode {
    const rawMode = String(process.env.AI_PREFIX_CACHE_MODE || "off").toLowerCase();
    if (rawMode === "enabled" || rawMode === "shadow") {
        return rawMode;
    }
    return "off";
}

function buildPromptExecutionPlan(
    rawPrompt: string,
    restaurantName: string,
    kanbanStatus: string,
    cupomGanho: string
) {
    const stableSystemInstruction = rawPrompt
        .replace(/{nome_restaurante}/g, restaurantName)
        .replace(
            /{kanban_status}/g,
            "[use o valor atual de kanban_status informado no Contexto dinamico do chat]"
        )
        .replace(
            /{cupom_ganho}/g,
            "[use o valor atual de cupom_ganho informado no Contexto dinamico do chat]"
        );
    const legacySystemInstruction = rawPrompt
        .replace(/{nome_restaurante}/g, restaurantName)
        .replace(/{kanban_status}/g, kanbanStatus)
        .replace(/{cupom_ganho}/g, cupomGanho);

    const dynamicContextSuffix = [
        "[Contexto dinamico do chat]",
        `kanban_status=${kanbanStatus}`,
        `cupom_ganho=${cupomGanho}`,
    ].join("\n");

    return {
        cacheKey: `${GEMINI_MODEL_NAME}:${stableSystemInstruction}`,
        stableSystemInstruction,
        legacySystemInstruction,
        dynamicContextSuffix,
    };
}

function withPrefixCacheContext(
    conversationContext: Content[],
    dynamicContextSuffix: string,
    prefixCacheMode: PrefixCacheMode
): Content[] {
    if (prefixCacheMode !== "enabled") {
        return conversationContext;
    }

    return [
        { role: "user", parts: [{ text: dynamicContextSuffix }] },
        ...conversationContext,
    ];
}

function getOrCreateGeminiModel(
    genAI: GoogleGenerativeAI,
    systemInstruction: string,
    cacheKey: string,
    usePrefixModelCache: boolean
) {
    if (!usePrefixModelCache) {
        logAiEvent("prefix_model_cache_bypass", { cacheKey });
        return genAI.getGenerativeModel({
            model: GEMINI_MODEL_NAME,
            systemInstruction,
            tools: [{ functionDeclarations: GEMINI_TOOLS }],
        });
    }

    const cachedModel = MODEL_CACHE.get(cacheKey);
    if (cachedModel) {
        logAiEvent("prefix_model_cache_hit", {
            cacheKey,
            cacheSize: MODEL_CACHE.size,
        });
        return cachedModel;
    }

    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL_NAME,
        systemInstruction,
        tools: [{ functionDeclarations: GEMINI_TOOLS }],
    });

    if (MODEL_CACHE.size >= MODEL_CACHE_LIMIT) {
        const oldestKey = MODEL_CACHE.keys().next().value;
        if (oldestKey) {
            MODEL_CACHE.delete(oldestKey);
        }
    }

    MODEL_CACHE.set(cacheKey, model);
    logAiEvent("prefix_model_cache_miss", {
        cacheKey,
        cacheSize: MODEL_CACHE.size,
    });
    return model;
}

function sanitizeGeminiHistory(history: Content[]): Content[] {
    const sanitized: Content[] = [];

    for (const msg of history) {
        if (sanitized.length === 0) {
            if (msg.role === "user") {
                sanitized.push({ role: msg.role, parts: [{ text: msg.parts[0]?.text || "" }] });
            }
            continue;
        }

        const lastSanitized = sanitized[sanitized.length - 1];

        if (msg.role === lastSanitized.role) {
            const currentText = msg.parts[0]?.text || "";
            if (currentText) {
                lastSanitized.parts[0].text += `\n${currentText}`;
            }
        } else {
            sanitized.push({ role: msg.role, parts: [{ text: msg.parts[0]?.text || "" }] });
        }
    }

    return sanitized;
}

function getContentText(content: Content | undefined) {
    if (!content?.parts?.length) {
        return "";
    }

    return content.parts
        .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
}

function formatCartSnapshotSummary(snapshot: unknown) {
    const meta = readCartSnapshotMeta(snapshot);
    if (!meta.hasItems && !meta.hasOrder) {
        return "nenhum";
    }

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

    if (meta.orderId) {
        parts.push(`order_id=${meta.orderId}`);
    }

    return parts.join(",");
}

function inferCommercialPhase(details: {
    latestInboundText: string;
    previousAssistantText: string;
    pendingSteps: string[];
    hasCupom: boolean;
}) {
    const latestInboundNormalized = details.latestInboundText.toLowerCase();
    const previousAssistantNormalized = details.previousAssistantText.toLowerCase();

    if (details.pendingSteps.length > 0) {
        return "coleta_dados_entrega";
    }

    if (
        /(pix|pagamento|pagar|dinheiro|cartao|cr[eé]dito|d[eé]bito)/i.test(
            latestInboundNormalized
        )
    ) {
        return "pagamento";
    }

    if (
        /(client_action:add_to_cart|quero|vou querer|pode mandar|fechar pedido|finalizar|confirmo)/i.test(
            latestInboundNormalized
        )
    ) {
        return "fechamento";
    }

    if (
        /(card[aá]pio|op[cç][aã]o|opcoes|escolha|combo|adicional|bebida|carrossel)/i.test(
            previousAssistantNormalized
        )
    ) {
        return "oferta_produtos";
    }

    if (details.hasCupom) {
        return "oferta_com_cupom";
    }

    return "atendimento_ativo";
}

function extractSalesSignals(conversationContext: Content[]) {
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
            /(fechar pedido|finalizar pedido|confirmar pedido|forma de pagamento|pagamento)/i.test(
                text
            )
        ) ||
        userTexts.some((text) =>
            /(vou querer|quero esse|pode mandar|fechar pedido|finalizar|confirmo)/i.test(text)
        );
    const customerRejectedOffer = userTexts.some((text) =>
        /(nao quero|não quero|nao precisa|não precisa|dispenso|talvez depois|deixa sem|sem\b)/i.test(
            text
        )
    );

    return {
        offeredAdditional,
        offeredDrink,
        closeAttemptStarted,
        customerRejectedOffer,
    };
}

function detectOfferRepetition(conversationContext: Content[]) {
    const assistantTexts = conversationContext
        .slice(-6)
        .filter((message) => message.role === "model")
        .map((message) => getContentText(message).toLowerCase())
        .filter(Boolean);

    const offerKinds = assistantTexts
        .map((text) => {
            if (/(adicional|extra|acrescentar|complemento|borda|molho)/i.test(text)) {
                return "adicional";
            }
            if (/(bebida|refrigerante|suco|agua|coca|guarana)/i.test(text)) {
                return "bebida";
            }
            if (/(combo|card[aÃ¡]pio|op[cÃ§][aÃ£]o|opcoes|escolha|carrossel)/i.test(text)) {
                return "catalogo";
            }
            if (
                /(fechar pedido|finalizar pedido|confirmar pedido|forma de pagamento|pagamento)/i.test(
                    text
                )
            ) {
                return "fechamento";
            }
            return null;
        })
        .filter((kind): kind is NonNullable<typeof kind> => kind !== null);

    const lastOfferKind = offerKinds[offerKinds.length - 1] || null;
    const repeatedOfferKind =
        offerKinds.length >= 2 && offerKinds[offerKinds.length - 1] === offerKinds[offerKinds.length - 2]
            ? offerKinds[offerKinds.length - 1]
            : null;

    return {
        lastOfferKind,
        repeatedOfferKind,
    };
}

function detectResumptionSignal(details: {
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
        /(lembrete|retomando|continuar seu pedido|posso seguir|ainda tem interesse|posso te ajudar a concluir)/i.test(
            text
        )
    );
    const cartPromptSeen = recentAssistantTexts.some((text) =>
        /(carrinho|seu pedido|finalizar pedido|fechar pedido|pagamento)/i.test(text)
    );

    if ((mentionsResume || mentionsConfirmation) && followupPromptSeen) {
        return "resposta_a_followup";
    }

    if ((mentionsResume || mentionsConfirmation) && cartPromptSeen) {
        return "retomada_carrinho";
    }

    if (/(oi|ola|olá|bom dia|boa tarde|boa noite)/i.test(latestInboundNormalized)) {
        return "nova_interacao";
    }

    return "continuidade_normal";
}

function detectTextRepetitionPattern(conversationContext: Content[]) {
    const assistantTexts = conversationContext
        .slice(-6)
        .filter((message) => message.role === "model")
        .map((message) => getContentText(message).trim().toLowerCase())
        .filter(Boolean);

    const normalizedAssistantTexts = assistantTexts.map((text) =>
        text
            .replace(/\s+/g, " ")
            .replace(/[.!?,;:]+$/g, "")
            .trim()
    );

    const lastAssistantText =
        normalizedAssistantTexts[normalizedAssistantTexts.length - 1] || null;
    const previousAssistantText =
        normalizedAssistantTexts[normalizedAssistantTexts.length - 2] || null;
    const exactRepeatDetected =
        Boolean(lastAssistantText) &&
        Boolean(previousAssistantText) &&
        lastAssistantText === previousAssistantText;
    const genericPromptRepeatDetected = normalizedAssistantTexts
        .slice(-3)
        .filter((text) =>
            /(escolha uma opcao|escolha uma opção|posso seguir|me diga como prefere|como deseja continuar)/i.test(
                text
            )
        ).length >= 2;

    return {
        exactRepeatDetected,
        genericPromptRepeatDetected,
    };
}

function detectDominantCustomerIntent(details: {
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

    if (
        /(quanto|preco|preço|valor|card[aá]pio|cardapio|tem|quais|qual sabor|como funciona)/i.test(
            latestInboundNormalized
        )
    ) {
        return "duvida";
    }

    if (
        /(nao quero|não quero|caro|muito caro|ta caro|tá caro|nao gostei|não gostei|talvez depois)/i.test(
            latestInboundNormalized
        )
    ) {
        return "objecao";
    }

    if (
        /(quero|vou querer|pode mandar|fechar pedido|finalizar|confirmo|sim pode|me ve|me vê)/i.test(
            latestInboundNormalized
        )
    ) {
        return "compra";
    }

    if (
        /(endereco|endereço|rua|numero|número|localizacao|localização|pix|pagamento|dinheiro|cartao|cartão)/i.test(
            recentUserJoined
        )
    ) {
        return "fechamento_operacional";
    }

    if (
        /(oi|ola|olá|bom dia|boa tarde|boa noite)/i.test(latestInboundNormalized)
    ) {
        return "saudacao";
    }

    return "indefinida";
}

function buildOperationalChatSummary(details: {
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

    if (!details.locationConfirmed) {
        pendingSteps.push("solicitar_localizacao_nativa");
    }
    if (!details.addressConfirmed) {
        pendingSteps.push("coletar_endereco");
    }
    if (!details.referenceConfirmed) {
        pendingSteps.push("coletar_ponto_de_referencia");
    }

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
        "nao_invente_produtos_precos_ou_frete; use_tool_para_dados_fatuais; nao_pule_pendencias_antes_de_cobrar_ou_finalizar";

    return [
        "[Resumo operacional do chat]",
        `kanban_status=${details.kanbanStatus}`,
        `fase_comercial=${commercialPhase}`,
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
        "Se houver pendencias operacionais, resolva antes de calcular frete, cobrar ou finalizar pedido.",
        "Se objetivo_comercial_recomendado indicar variar abordagem, nao repita a mesma oferta ou a mesma frase recente.",
        "Use este resumo para manter contexto. Se houver divergencia, priorize a mensagem mais recente do cliente.",
    ].join("\n");
}

function optimizeConversationContext(
    conversationContext: Content[],
    operationalSummary: string,
    prefixCacheMode: PrefixCacheMode
) {
    if (prefixCacheMode !== "enabled") {
        return conversationContext;
    }

    const recentContext = conversationContext.slice(-ENABLED_MODE_RECENT_CONTEXT_LIMIT);

    return [
        { role: "user", parts: [{ text: operationalSummary }] },
        ...recentContext,
    ];
}

/**
 * Detects if a text contains standard street markers (Rua, Av, CEP, Bairro).
 */
function looksLikeAddress(text: string) {
    const normalized = text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    if (!normalized.trim()) return false;

    const streetHints = [
        "rua",
        "r.",
        "avenida",
        "av.",
        "av ",
        "travessa",
        "tv.",
        "alameda",
        "bairro",
        "numero",
        "n ",
        "cep",
        "quadra",
        "lote",
    ];

    if (streetHints.some((hint) => normalized.includes(hint))) {
        return true;
    }

    // Pattern for number followed by street-like word: "123 Rua" or "Rua X 123"
    return /\d{1,5}[\s,.-]+[a-z]/i.test(normalized);
}

/**
 * Detects if a text contains landmarks or descriptive reference markers.
 */
function looksLikeReference(text: string) {
    const normalized = text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const refHints = [
        "perto de",
        "ao lado de",
        "em frente a",
        "proximo a",
        "esquina",
        "portao",
        "casa",
        "loja",
        "mercado",
        "farmacia",
        "posto",
        "predio",
        "bloco",
        "apto",
        "apartamento",
        "residencial",
        "condominio",
    ];

    return refHints.some((hint) => normalized.includes(hint));
}

/**
 * Detects if a message (current or from history) contains a native location shared via WhatsApp.
 */
function hasNativeLocation(payload: unknown, text?: string | null) {
    const lowerText = String(text || "").toLowerCase();

    // Check for the internal prefix used for text-based location sharing
    if (lowerText.startsWith("client_action:location_shared ")) {
        return true;
    }

    // Check for raw WhatsApp native location message in the payload
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

async function normalizeIncomingText(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    params: OrchestratorParams
) {
    const raw = (params.incomingText || "").trim();
    if (!raw) return raw;

    const normalizedToken = raw.replace(/\s+/g, "_");
    const productActionMatch = normalizedToken.match(
        /^(?:add|buy|prod|sim_comprar)_([0-9a-f-]{36})$/i
    );

    if (productActionMatch) {
        const productId = productActionMatch[1];
        const { data: product } = await supabase
            .from("produtos_promo")
            .select("id, nome, category")
            .eq("restaurant_id", params.restaurantId)
            .eq("id", productId)
            .maybeSingle();

        if (product?.id) {
            const productName = typeof product.nome === "string" ? product.nome : "produto";
            const productCategory = typeof product.category === "string" ? product.category : "principal";
            return `CLIENT_ACTION:add_to_cart product_id=${product.id} product_name="${productName}" category=${productCategory}`;
        }
    }

    return raw;
}

async function sendTextMessage(number: string, text: string, instanceToken: string) {
    const base = process.env.UAZAPI_BASE_URL;
    if (!base || !instanceToken) {
        return {
            ok: false,
            delivered: false,
            error: "UAZAPI_NOT_CONFIGURED",
            endpoint: "/send/text",
        } satisfies OutboundSendResult;
    }

    const cleanNumber = number.split("@")[0].replace(/\D/g, "");
    try {
        const res = await fetchWithTimeout(
            `${normalizeBaseUrl(base)}/send/text`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", token: instanceToken },
                body: JSON.stringify({ number: cleanNumber, text }),
            },
            UAZAPI_REQUEST_TIMEOUT_MS
        );

        const raw = await res.text();
        return {
            ok: res.ok,
            delivered: res.ok,
            status: res.status,
            body: parseApiResponseBody(raw),
            endpoint: "/send/text",
        } satisfies OutboundSendResult;
    } catch (error: unknown) {
        return {
            ok: false,
            delivered: false,
            error: getErrorMessage(error) || "UAZAPI_TEXT_SEND_FAILED",
            endpoint: "/send/text",
        } satisfies OutboundSendResult;
    }
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function wasOutboundDeliveryAccepted(result: OutboundSendResult | null | undefined) {
    return Boolean(result?.delivered);
}

function validateOutgoingPayload(endpoint: string, payload: Record<string, unknown>) {
    if (!isNonEmptyString(payload.number)) {
        return { ok: false, error: "INVALID_UAZ_PAYLOAD_NUMBER" };
    }

    if (endpoint === "/send/request-payment") {
        if (typeof payload.amount !== "number" || !Number.isFinite(payload.amount) || payload.amount <= 0) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_AMOUNT" };
        }
        if (!isNonEmptyString(payload.pixKey) || !isNonEmptyString(payload.pixType)) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_PIX" };
        }
    }

    if (endpoint === "/send/pix-button") {
        if (!isNonEmptyString(payload.pixKey) || !isNonEmptyString(payload.pixType)) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_PIX" };
        }
    }

    if (endpoint === "/send/location-button") {
        if (!isNonEmptyString(payload.text)) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_TEXT" };
        }
    }

    if (endpoint === "/send/carousel") {
        if (!Array.isArray(payload.carousel) || payload.carousel.length === 0) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_CAROUSEL" };
        }
    }

    if (endpoint === "/send/buttons") {
        const hasChoices = Array.isArray(payload.choices) && payload.choices.length > 0;
        const hasButtonsMessage = Array.isArray(payload.buttonsMessage) && payload.buttonsMessage.length > 0;
        if (!hasChoices && !hasButtonsMessage) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_BUTTONS" };
        }
    }

    if (endpoint === "/send/list") {
        const hasList = Array.isArray(payload.list) && payload.list.length > 0;
        const hasListMessage = Array.isArray(payload.listMessage) && payload.listMessage.length > 0;
        if (!hasList && !hasListMessage) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_LIST" };
        }
    }

    return { ok: true };
}

async function sendRichPayload(uazapiPayload: Record<string, unknown>, instanceToken: string) {
    const base = process.env.UAZAPI_BASE_URL;
    if (!base || !instanceToken) {
        return {
            ok: false,
            delivered: false,
            error: "UAZAPI_NOT_CONFIGURED",
        } satisfies OutboundSendResult;
    }

    const payload = { ...uazapiPayload };

    let endpoint = "/send/text";

    if (payload.locationButton) {
        endpoint = "/send/location-button";
        delete payload.locationButton;
    } else if (payload.carousel) endpoint = "/send/carousel";
    else if (payload.pixKey && payload.amount) endpoint = "/send/request-payment";
    else if (payload.pixKey) endpoint = "/send/pix-button";
    else if (payload.type === "button" || payload.buttonsMessage || payload.choices) endpoint = "/send/buttons";
    else if (payload.listMessage || payload.list) endpoint = "/send/list";
    else if (payload.templateMessage || payload.template) endpoint = "/send/template";

    const payloadValidation = validateOutgoingPayload(endpoint, payload as Record<string, unknown>);
    if (!payloadValidation.ok) {
        console.error("[UAZAPI_PAYLOAD] Invalid payload", { endpoint, error: payloadValidation.error });
        return {
            ok: false,
            delivered: false,
            error: payloadValidation.error,
            body: payloadValidation,
            endpoint,
        } satisfies OutboundSendResult;
    }

    try {
        const res = await fetchWithTimeout(
            `${normalizeBaseUrl(base)}${endpoint}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", token: instanceToken },
                body: JSON.stringify(payload),
            },
            UAZAPI_REQUEST_TIMEOUT_MS
        );

        const raw = await res.text();
        return {
            ok: res.ok,
            delivered: res.ok,
            status: res.status,
            body: parseApiResponseBody(raw),
            endpoint,
        } satisfies OutboundSendResult;
    } catch (error: unknown) {
        return {
            ok: false,
            delivered: false,
            error: getErrorMessage(error) || "UAZAPI_RICH_SEND_FAILED",
            endpoint,
        } satisfies OutboundSendResult;
    }
}

async function persistOutgoingMessage(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    params: OrchestratorParams,
    text: string,
    payload?: unknown
) {
    await supabase.from("messages").insert({
        restaurant_id: params.restaurantId,
        chat_id: params.chatId,
        direction: "out",
        text,
        payload: payload ?? null,
    });
}

export async function processAiMessage(params: OrchestratorParams) {
    console.log(`[AI LOOP] Started for ChatID: ${params.chatId}`);
    logAiEvent("process_started", {
        chatId: params.chatId,
        restaurantId: params.restaurantId,
        waChatId: params.waChatId,
    });
    const supabase = getSupabaseAdmin();
    const normalizedIncomingText = await normalizeIncomingText(supabase, params);

    const { data: restData } = await supabase
        .from("restaurants")
        .select("name, uaz_instance_token, system_prompt")
        .eq("id", params.restaurantId)
        .single();

    const instanceToken = restData?.uaz_instance_token || "";
    const restaurantName = restData?.name || "FoodSpin";
    if (!instanceToken) {
        logAiEvent("process_aborted", {
            chatId: params.chatId,
            reason: "MISSING_UAZ_INSTANCE_TOKEN",
        });
        return;
    }

    // 1. Fetch history with payload to detect past state
    const { data: messages } = await supabase
        .from("messages")
        .select("direction, text, payload, created_at")
        .eq("chat_id", params.chatId)
        .order("created_at", { ascending: false })
        .limit(15);

    const typedMessages = (messages || []) as StoredMessage[];
    const latestInboundMessage = typedMessages.find((m) => m.direction === "in");

    // 2. Identify confirmed state (Location + Address + Reference) across current turn + history
    const incomingTextClean = normalizedIncomingText.toLowerCase();

    const incomingHasLocation = incomingTextClean.startsWith("client_action:location_shared ");
    const incomingHasAddress = !incomingHasLocation && looksLikeAddress(normalizedIncomingText);
    const incomingHasReference = !incomingHasLocation && looksLikeReference(normalizedIncomingText);

    const incomingMessages = typedMessages.filter((m) => m.direction === "in");

    const historyHasLocation = incomingMessages.some((m) =>
        hasNativeLocation(m.payload, m.text)
    );

    const historyHasAddress = incomingMessages.some((m) => {
        const text = typeof m.text === "string" ? m.text : "";
        if (!text || text.toLowerCase().startsWith("client_action:location_shared ")) return false;
        return looksLikeAddress(text);
    });

    const historyHasReference = incomingMessages.some((m) => {
        const text = typeof m.text === "string" ? m.text : "";
        if (!text || text.toLowerCase().startsWith("client_action:location_shared ")) return false;
        return looksLikeReference(text);
    });

    const locationConfirmed = incomingHasLocation || historyHasLocation;
    const addressConfirmed = incomingHasAddress || historyHasAddress;
    const referenceConfirmed = incomingHasReference || historyHasReference;

    const { data: chatContext } = await supabase
        .from("chats")
        .select("stage_id, kanban_status, cupom_ganho, cart_snapshot, kanban_stages(name)")
        .eq("id", params.chatId)
        .single();

    const typedChatContext = (chatContext || null) as ChatContextRecord | null;

    let geminiHistory: Content[] = [];
    if (typedMessages.length > 0) {
        geminiHistory = [...typedMessages].reverse().map((m) => ({
            role: m.direction === "in" ? "user" : "model",
            parts: [{ text: m.text || "[Midia omitida]" }],
        }));
    }

    const diasSemana = ["Domingo", "Segunda-feira", "Terca-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sabado"];
    const agora = new Date();
    const horaLocal = agora.toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
    });
    const contextoTemporal = `[Hoje: ${diasSemana[agora.getDay()]}, Hora Atual: ${horaLocal}]`;

    if (geminiHistory.length === 0) {
        const triggerText = normalizedIncomingText || `[Roleta: ${typedChatContext?.cupom_ganho || "Premio Ativado"}] ${contextoTemporal}`;
        geminiHistory.push({ role: "user", parts: [{ text: triggerText }] });
    } else if (normalizedIncomingText && geminiHistory[geminiHistory.length - 1].role === "model") {
        geminiHistory.push({ role: "user", parts: [{ text: normalizedIncomingText }] });
    }

    const fallbackPrompt = "Voce e o Gerente de Conversao Premium do restaurante {nome_restaurante}. Responda de forma curta, amigavel e auxilie o cliente com o seu pedido.";
    const rawPrompt = restData?.system_prompt || fallbackPrompt;
    const kanbanStatus =
        readKanbanStageName(typedChatContext?.kanban_stages) ||
        typedChatContext?.kanban_status ||
        "Desconhecido";
    const cupomGanho = typedChatContext?.cupom_ganho || "Nenhum";
    const prefixCacheMode = getPrefixCacheMode();
    const baseConversationContext = sanitizeGeminiHistory(geminiHistory);
    const operationalSummary = buildOperationalChatSummary({
        kanbanStatus,
        cupomGanho,
        cartSnapshot: typedChatContext?.cart_snapshot,
        locationConfirmed,
        addressConfirmed,
        referenceConfirmed,
        latestInboundText: normalizedIncomingText || "Nenhuma",
        conversationContext: baseConversationContext,
    });
    const conversationContext = optimizeConversationContext(
        baseConversationContext,
        operationalSummary,
        prefixCacheMode
    );
    const promptPlan = buildPromptExecutionPlan(rawPrompt, restaurantName, kanbanStatus, cupomGanho);

    logAiEvent("context_ready", {
        chatId: params.chatId,
        inboundMessages: incomingMessages.length,
        totalMessages: typedMessages.length,
        baseContextMessages: baseConversationContext.length,
        contextMessages: conversationContext.length,
        optimizedContextApplied: prefixCacheMode === "enabled",
        locationConfirmed,
        addressConfirmed,
        referenceConfirmed,
        kanbanStatus,
        prefixCacheMode,
        triggerMessageCreatedAt: latestInboundMessage?.created_at || null,
    });

    if (prefixCacheMode === "shadow") {
        console.log("[AI PREFIX CACHE] Shadow comparison", {
            chatId: params.chatId,
            stable_instruction_chars: promptPlan.stableSystemInstruction.length,
            legacy_instruction_chars: promptPlan.legacySystemInstruction.length,
            dynamic_suffix_chars: promptPlan.dynamicContextSuffix.length,
        });
        logAiEvent("prefix_cache_shadow", {
            chatId: params.chatId,
            stableInstructionChars: promptPlan.stableSystemInstruction.length,
            legacyInstructionChars: promptPlan.legacySystemInstruction.length,
            dynamicSuffixChars: promptPlan.dynamicContextSuffix.length,
        });
    }

    const ctx: ToolContext = {
        restaurant_id: params.restaurantId,
        wa_chat_id: params.waChatId,
        chat_id: params.chatId,
        base_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        trigger_message_created_at: latestInboundMessage?.created_at || undefined,
    };

    let loopActive = true;
    let iteration = 0;
    const MAX_ITERATIONS = 5;

    const toolInvocationFingerprints = new Set<string>();
    const turnEvidence = {
        hasFreightCalculation: false,
        hasPixQuote: false,
    };

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = getOrCreateGeminiModel(
            genAI,
            prefixCacheMode === "enabled"
                ? promptPlan.stableSystemInstruction
                : promptPlan.legacySystemInstruction,
            promptPlan.cacheKey,
            prefixCacheMode === "enabled"
        );

        while (loopActive && iteration < MAX_ITERATIONS) {
            iteration++;
            console.log(`[AI LOOP] Thinking... Iteration ${iteration}`);
            logAiEvent("iteration_started", {
                chatId: params.chatId,
                iteration,
                contextMessages: conversationContext.length,
            });

            const startTimeMs = Date.now();
            const response = await withTimeout(
                model.generateContent({
                    contents: withPrefixCacheContext(
                        conversationContext,
                        promptPlan.dynamicContextSuffix,
                        prefixCacheMode
                    ),
                }),
                GEMINI_REQUEST_TIMEOUT_MS,
                "GEMINI_REQUEST_TIMEOUT"
            );
            const durationMs = Date.now() - startTimeMs;

            const responseMessage = response.response;
            const usage = responseMessage.usageMetadata;

            supabase.from("ai_logs").insert({
                restaurant_id: params.restaurantId,
                chat_id: params.chatId,
                wa_chat_id: params.waChatId,
                model: "gemini-2.5-flash",
                prompt_tokens: usage?.promptTokenCount || 0,
                completion_tokens: usage?.candidatesTokenCount || 0,
                total_tokens: usage?.totalTokenCount || 0,
                duration_ms: durationMs,
            }).then(({ error }) => {
                if (error) console.error("[TELEMETRY] Error:", error.message);
            });
            logAiEvent("llm_response_received", {
                chatId: params.chatId,
                iteration,
                durationMs,
                promptTokens: usage?.promptTokenCount || 0,
                completionTokens: usage?.candidatesTokenCount || 0,
                totalTokens: usage?.totalTokenCount || 0,
            });

            const candidate = responseMessage.candidates?.[0];
            const modelContent = candidate?.content as Content | undefined;
            const parts: Part[] = modelContent?.parts || [];

            let textPart = "";
            try {
                textPart = stripThoughtBlocks(responseMessage.text() || "");
            } catch {
                textPart = "";
            }

            const functionCallPart = parts.find((part) => part?.functionCall);
            if (functionCallPart?.functionCall) {
                const toolName = functionCallPart.functionCall.name as string;
                const toolArgs = (functionCallPart.functionCall.args || {}) as Record<string, unknown>;
                const toolFingerprint = `${toolName}:${JSON.stringify(toolArgs)}`;

                if (toolInvocationFingerprints.has(toolFingerprint)) {
                    console.warn("[AI LOOP] Repeated tool blocked", { toolName });
                    logAiEvent("tool_blocked", {
                        chatId: params.chatId,
                        iteration,
                        toolName,
                        reason: "REPEATED_TOOL_INVOCATION",
                    });
                    loopActive = false;
                    break;
                }

                toolInvocationFingerprints.add(toolFingerprint);

                console.log(`[AI LOOP] Executing tool: ${toolName}`);
                let parsedToolResult: unknown = null;
                const requiresConfirmedLocation = ["calculate_cart_total", "submit_final_order", "get_pix_payment"].includes(toolName);
                let toolBlockReason: string | null = null;

                if (toolName === "request_user_location" && locationConfirmed) {
                    toolBlockReason = "LOCATION_ALREADY_SHARED";
                    parsedToolResult = {
                        ok: true,
                        skipped: true,
                        reason: "LOCATION_ALREADY_SHARED",
                        message: "O cliente ja compartilhou a localizacao nativa.",
                    };
                } else if (requiresConfirmedLocation && !locationConfirmed) {
                    toolBlockReason = "LOCATION_REQUIRED";
                    parsedToolResult = {
                        ok: true,
                        skipped: true,
                        reason: "LOCATION_REQUIRED",
                        message: "A localizacao nativa do cliente e obrigatoria antes de calcular frete, cobrar ou finalizar.",
                    };
                } else if (requiresConfirmedLocation && !addressConfirmed) {
                    toolBlockReason = "ADDRESS_REQUIRED";
                    parsedToolResult = {
                        ok: true,
                        skipped: true,
                        reason: "ADDRESS_REQUIRED",
                        message: "O endereco (rua e numero) e obrigatorio antes de calcular frete, cobrar ou finalizar.",
                    };
                } else if (requiresConfirmedLocation && !referenceConfirmed) {
                    toolBlockReason = "REFERENCE_REQUIRED";
                    parsedToolResult = {
                        ok: true,
                        skipped: true,
                        reason: "REFERENCE_REQUIRED",
                        message: "O ponto de referencia e obrigatorio antes de calcular frete, cobrar ou finalizar.",
                    };
                } else {
                    const toolResultRaw = await executeAiTool(toolName, toolArgs, ctx);
                    try {
                        parsedToolResult = JSON.parse(toolResultRaw);
                    } catch {
                        parsedToolResult = { ok: false, raw: toolResultRaw };
                    }
                }

                const parsedToolResultRecord = asRecord(parsedToolResult);
                if (toolName === "calculate_cart_total" && parsedToolResultRecord?.ok === true) {
                    turnEvidence.hasFreightCalculation = true;
                }
                if (toolName === "get_pix_payment" && parsedToolResultRecord?.ok === true) {
                    turnEvidence.hasPixQuote = true;
                }
                logAiEvent("tool_completed", {
                    chatId: params.chatId,
                    iteration,
                    toolName,
                    blocked: Boolean(toolBlockReason),
                    reason: toolBlockReason,
                    ok: parsedToolResultRecord?.ok === true,
                    skipped: parsedToolResultRecord?.skipped === true,
                    hasUazPayload: Boolean(asRecord(parsedToolResultRecord?.uazapi_payload)),
                    requiresPixPayment: parsedToolResultRecord?.requires_pix_payment === true,
                });

                if (
                    toolName === "submit_final_order" &&
                    parsedToolResultRecord?.ok === true &&
                    parsedToolResultRecord?.requires_pix_payment === true
                ) {
                    const pixToolRaw = await executeAiTool(
                        "get_pix_payment",
                        { amount: parsedToolResultRecord.pix_amount },
                        ctx
                    );

                    try {
                        const pixToolResult = asRecord(JSON.parse(pixToolRaw));
                        const pixPayload = asRecord(pixToolResult?.uazapi_payload);
                        if (pixPayload) {
                            turnEvidence.hasPixQuote = true;
                            const typedPixPayload = asPixPayload(pixPayload);
                            if (
                                typedPixPayload &&
                                await wasPixPayloadAlreadySent(
                                    supabase,
                                    params.chatId,
                                    typedPixPayload,
                                    ctx.trigger_message_created_at
                                )
                            ) {
                                console.warn("[AI LOOP] Duplicate PIX payload skipped", {
                                    chatId: params.chatId,
                                });
                                logAiEvent("pix_payload_skipped", {
                                    chatId: params.chatId,
                                    iteration,
                                    reason: "DUPLICATE_PAYLOAD_IN_CURRENT_TURN",
                                    sourceTool: toolName,
                                });
                                loopActive = false;
                                break;
                            }

                            const pixSendResult = await sendRichPayload(
                                pixPayload,
                                instanceToken
                            );
                            if (wasOutboundDeliveryAccepted(pixSendResult)) {
                                const persistedText =
                                    (typeof pixPayload.text === "string" && pixPayload.text) || "[get_pix_payment]";
                                logAiEvent("outbound_payload_sent", {
                                    chatId: params.chatId,
                                    iteration,
                                    toolName: "get_pix_payment",
                                    endpoint: pixSendResult.endpoint || "/send/request-payment",
                                    status: pixSendResult.status || null,
                                    delivered: true,
                                });
                                await persistOutgoingMessage(
                                    supabase,
                                    params,
                                    persistedText,
                                    pixPayload
                                );
                                loopActive = false;
                                break;
                            }

                            console.error("[AI LOOP] PIX payload delivery failed", {
                                chatId: params.chatId,
                                result: pixSendResult,
                            });
                            logAiEvent("outbound_payload_failed", {
                                chatId: params.chatId,
                                iteration,
                                toolName: "get_pix_payment",
                                endpoint: pixSendResult.endpoint || "/send/request-payment",
                                status: pixSendResult.status || null,
                                error: pixSendResult.error || null,
                            });
                            loopActive = false;
                            break;
                        }
                    } catch {
                        // se falhar o parse, segue o fluxo normal abaixo
                    }
                }

                const parsedUazPayload = asRecord(parsedToolResultRecord?.uazapi_payload);
                if (parsedUazPayload) {
                    const typedPixPayload = toolName === "get_pix_payment"
                        ? asPixPayload(parsedUazPayload)
                        : null;
                    if (
                        typedPixPayload &&
                        await wasPixPayloadAlreadySent(
                            supabase,
                            params.chatId,
                            typedPixPayload,
                            ctx.trigger_message_created_at
                        )
                    ) {
                        console.warn("[AI LOOP] Duplicate PIX payload skipped", {
                            chatId: params.chatId,
                            toolName,
                        });
                        logAiEvent("pix_payload_skipped", {
                            chatId: params.chatId,
                            iteration,
                            toolName,
                            reason: "DUPLICATE_PAYLOAD_IN_CURRENT_TURN",
                        });
                        loopActive = false;
                        break;
                    }

                    const sendResult = await sendRichPayload(parsedUazPayload, instanceToken);
                    if (!wasOutboundDeliveryAccepted(sendResult)) {
                        console.error("[AI LOOP] Rich payload delivery failed", {
                            chatId: params.chatId,
                            toolName,
                            result: sendResult,
                        });
                        logAiEvent("outbound_payload_failed", {
                            chatId: params.chatId,
                            iteration,
                            toolName,
                            endpoint: sendResult.endpoint || null,
                            status: sendResult.status || null,
                            error: sendResult.error || null,
                        });
                        loopActive = false;
                        break;
                    }

                    const persistedText =
                        (typeof parsedUazPayload.text === "string" && parsedUazPayload.text) ||
                        `[${toolName}]`;
                    logAiEvent("outbound_payload_sent", {
                        chatId: params.chatId,
                        iteration,
                        toolName,
                        endpoint: sendResult.endpoint || null,
                        status: sendResult.status || null,
                        delivered: true,
                    });
                    await persistOutgoingMessage(supabase, params, persistedText, parsedUazPayload);
                    loopActive = false;
                    break;
                }

                const modelFunctionCallPart: FunctionCallPart = {
                    functionCall: functionCallPart.functionCall,
                };
                const userFunctionResponsePart: FunctionResponsePart = {
                    functionResponse: {
                        name: toolName,
                        response: { content: parsedToolResult },
                    },
                };

                conversationContext.push({
                    role: "model",
                    parts: [modelFunctionCallPart],
                });
                conversationContext.push({
                    role: "user",
                    parts: [userFunctionResponsePart],
                });
                continue;
            }

            if (textPart) {
                const outboundText = normalizeOutboundText(textPart, {
                    restaurantName,
                    kanbanStatus,
                    cupomGanho,
                });
                if (!outboundText.ok) {
                    logAiEvent("outbound_text_blocked", {
                        chatId: params.chatId,
                        iteration,
                        reason: outboundText.reason,
                    });
                    loopActive = false;
                    break;
                }

                const commercialClaimRisk = detectUnverifiedCommercialClaim(
                    outboundText.text,
                    turnEvidence
                );
                const safeOutboundText = commercialClaimRisk.risky
                    ? commercialClaimRisk.safeFallbackText
                    : outboundText.text;
                if (commercialClaimRisk.risky) {
                    logAiEvent("outbound_text_sanitized", {
                        chatId: params.chatId,
                        iteration,
                        reason: commercialClaimRisk.reason,
                    });
                }

                const sendResult = await sendTextMessage(params.waChatId, safeOutboundText, instanceToken);
                if (!wasOutboundDeliveryAccepted(sendResult)) {
                    console.error("[AI LOOP] Text delivery failed", {
                        chatId: params.chatId,
                        result: sendResult,
                    });
                    logAiEvent("outbound_text_failed", {
                        chatId: params.chatId,
                        iteration,
                        endpoint: sendResult.endpoint || "/send/text",
                        status: sendResult.status || null,
                        error: sendResult.error || null,
                    });
                    loopActive = false;
                    break;
                }

                logAiEvent("outbound_text_sent", {
                    chatId: params.chatId,
                    iteration,
                    endpoint: sendResult.endpoint || "/send/text",
                    status: sendResult.status || null,
                    textLength: safeOutboundText.length,
                });
                await persistOutgoingMessage(supabase, params, safeOutboundText);
                loopActive = false;
                break;
            }

            console.warn("[AI LOOP] Empty response, stopping.");
            logAiEvent("iteration_stopped", {
                chatId: params.chatId,
                iteration,
                reason: "EMPTY_RESPONSE",
            });
            loopActive = false;
        }
    } catch (error: unknown) {
        console.error("[AI LOOP] Fatal error:", getErrorMessage(error));
        logAiEvent("process_failed", {
            chatId: params.chatId,
            error: getErrorMessage(error),
        });
     }
}
