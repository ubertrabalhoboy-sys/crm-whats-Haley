/**
 * AI Orchestrator — Main Entry Point
 *
 * This module contains `processAiMessage`, the core function that
 * processes incoming WhatsApp messages through the AI pipeline.
 *
 * Helper functions, types, and constants have been extracted to:
 * - orchestrator-types.ts  — Type definitions & constants
 * - orchestrator-utils.ts  — Utility functions (parsing, fingerprinting, etc.)
 * - gemini-client.ts       — Gemini model management & history
 * - conversation-analyzer.ts — Context analysis & pattern detection
 * - message-sender.ts      — Outbound messaging & persistence
 */

import {
    GoogleGenerativeAI,
    Content,
    FunctionCallPart,
    FunctionResponsePart,
    Part,
} from "@google/generative-ai";
import OpenAI from "openai";
import { detectSentiment } from "./conversation-analyzer";
import { executeAiTool, ToolContext } from "./toolHandler";
import { readCartSnapshotMeta } from "./heuristics";
import {
    buildActiveCategoryPitch,
    buildObjectionRecoveryPitch,
    buildPostAddToCartSalesPlan,
    detectSalesObjectionIntent,
    detectRouletteChoiceIntent,
    detectStructuredReplyIntent,
    detectUnverifiedCommercialClaim,
    isNeutralInboundWithoutCatalogIntent,
    isRoulettePrizeTrigger,
    normalizeOutboundText,
    parseAddToCartClientAction,
    resolveCategoryForPlaybook,
    shouldAutoCalculateAfterOperationalInput,
    shouldHandleDelayedCouponDeferral,
    stripThoughtBlocks,
} from "./orchestratorRules";
import {
    buildAiTurnSummary,
    createAiTurnMetrics,
    markIterationStarted,
    markOutboundTextBlocked,
    markOutboundTextSanitized,
    markPayloadFailed,
    markPayloadSent,
    markPixPayloadSkipped,
    markProcessFailure,
    markTextFailed,
    markTextSent,
    markToolCompleted,
} from "./aiMetrics";

// ---------------------------------------------------------------------------
// Re-exports from extracted modules
// ---------------------------------------------------------------------------

import type {
    StoredMessage,
    ChatContextRecord,
    OrchestratorParams,
} from "./orchestrator-types";
import {
    GEMINI_MODEL_NAME,
    GEMINI_REQUEST_TIMEOUT_MS,
} from "./orchestrator-types";

import {
    getSupabaseAdmin,
    getErrorMessage,
    logAiEvent,
    withTimeout,
    asRecord,
    readKanbanStageName,
    asPixPayload,
    wasPixPayloadAlreadySent,
    wasOutgoingPayloadAlreadySent,
    getPrefixCacheMode,
    sanitizeStoredSystemPrompt,
    asProductList,
    persistCartSelectionFromAction,
    buildPromptExecutionPlan,
    withPrefixCacheContext,
    extractLatestOperationalText,
    extractLatestGpsLocation,
    getCartItemsFromSnapshot,
    getRestaurantSalesPlaybook,
    wasTurnSupersededByNewInbound,
    persistAiTurnMetrics,
} from "./orchestrator-utils";

import {
    getOrCreateGeminiModel,
    getContentText,
    sanitizeGeminiHistory,
} from "./gemini-client";

import {
    buildPostLocationFollowUpMessage,
    buildOperationalChatSummary,
    optimizeConversationContext,
    looksLikeAddress,
    looksLikeReference,
    extractOperationalInputParts,
    hasNativeLocation,
    buildCartTotalSummaryText,
    isStoreOpenForCheckout,
} from "./conversation-analyzer";

import {
    normalizeIncomingText,
    sendTextMessage,
    wasOutboundDeliveryAccepted,
    sendRichPayload,
    persistOutgoingMessage,
} from "./message-sender";
import { APP_URL, GEMINI_API_KEY, OPENAI_API_KEY } from "../shared/env";

type SentimentLabel = "Satisfeito" | "Frustrado" | "Neutro";

type OpenAiFallbackResult = {
    text: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
};

const OPENAI_FALLBACK_MODEL_NAME = "gpt-4o-mini";
const SENTIMENT_LLM_EVERY_N_TURNS = 5;
const SENTIMENT_LLM_TIMEOUT_MS = 5000;

function parseSentimentLabel(raw: string): SentimentLabel | null {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.includes("frustrado")) return "Frustrado";
    if (normalized.includes("satisfeito")) return "Satisfeito";
    if (normalized.includes("neutro")) return "Neutro";
    return null;
}

function extractConversationTranscript(
    conversationContext: Content[],
    limit = 10
): string {
    return conversationContext
        .slice(-limit)
        .map((message) => {
            const text = getContentText(message);
            if (!text) return "";
            const role = message.role === "user" ? "Cliente" : "Assistente";
            return `${role}: ${text}`;
        })
        .filter(Boolean)
        .join("\n");
}

async function classifySentimentWithLlm(
    conversationContext: Content[]
): Promise<SentimentLabel | null> {
    const transcript = extractConversationTranscript(conversationContext, 8);
    if (!transcript) return null;

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const sentimentModel = genAI.getGenerativeModel({
            model: GEMINI_MODEL_NAME,
            systemInstruction:
                "Classifique o sentimento do cliente em uma unica palavra: Satisfeito, Frustrado ou Neutro.",
        });

        const response = await withTimeout(
            sentimentModel.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: [
                                    "Classifique o sentimento predominante do cliente na conversa abaixo.",
                                    "Responda somente com uma palavra: Satisfeito, Frustrado ou Neutro.",
                                    "",
                                    transcript,
                                ].join("\n"),
                            },
                        ],
                    },
                ],
            }),
            SENTIMENT_LLM_TIMEOUT_MS,
            "SENTIMENT_LLM_TIMEOUT"
        );

        return parseSentimentLabel(response.response.text() || "");
    } catch (error: unknown) {
        logAiEvent("sentiment_llm_failed", {
            error: getErrorMessage(error),
        });
        return null;
    }
}

async function generateFallbackTextWithOpenAI(params: {
    systemInstruction: string;
    conversationContext: Content[];
}): Promise<OpenAiFallbackResult | null> {
    if (!OPENAI_API_KEY) return null;

    const transcriptMessages = params.conversationContext
        .map((message) => {
            const text = getContentText(message);
            if (!text) return null;
            return {
                role: message.role === "user" ? ("user" as const) : ("assistant" as const),
                content: text,
            };
        })
        .filter((item): item is { role: "user" | "assistant"; content: string } => item !== null);

    if (transcriptMessages.length === 0) return null;

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await withTimeout(
        client.chat.completions.create({
            model: OPENAI_FALLBACK_MODEL_NAME,
            temperature: 0.3,
            max_completion_tokens: 220,
            messages: [
                {
                    role: "system",
                    content: [
                        params.systemInstruction,
                        "Seja objetivo, responda em portugues e nao exponha raciocinio interno.",
                        "Se faltar dado, peca somente o proximo dado necessario em uma frase curta.",
                    ].join("\n"),
                },
                ...transcriptMessages,
            ],
        }),
        GEMINI_REQUEST_TIMEOUT_MS,
        "OPENAI_FALLBACK_TIMEOUT"
    );

    const content = completion.choices[0]?.message?.content;
    const text = typeof content === "string" ? content.trim() : "";
    if (!text) return null;

    return {
        text,
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
    };
}






export async function processAiMessage(params: OrchestratorParams) {
    console.log(`[AI LOOP] Started for ChatID: ${params.chatId}`);
    logAiEvent("process_started", {
        chatId: params.chatId,
        restaurantId: params.restaurantId,
        waChatId: params.waChatId,
    });
    const supabase = getSupabaseAdmin();

    const [
        normalizedIncomingText,
        { data: restData },
        { data: messages },
        { data: chatContext },
        restaurantPlaybook
    ] = await Promise.all([
        normalizeIncomingText(supabase, params),
        supabase
            .from("restaurants")
            .select("name, uaz_instance_token, system_prompt")
            .eq("id", params.restaurantId)
            .single(),
        supabase
            .from("messages")
            .select("direction, text, payload, created_at")
            .eq("chat_id", params.chatId)
            .order("created_at", { ascending: false })
            .limit(15),
        supabase
            .from("chats")
            .select("stage_id, kanban_status, cupom_ganho, cart_snapshot, kanban_stages(name)")
            .eq("id", params.chatId)
            .single(),
        getRestaurantSalesPlaybook(supabase, params.restaurantId)
    ]);

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
    const typedMessages = (messages || []) as StoredMessage[];
    const latestInboundMessage = typedMessages.find((m) => m.direction === "in");

    // 2. Identify confirmed state (Location + Address + Reference) across current turn + history
    const incomingTextClean = normalizedIncomingText.toLowerCase();

    const incomingHasLocation = incomingTextClean.startsWith("client_action:location_shared ");
    const incomingOperationalInput = incomingHasLocation
        ? { addressText: "", referenceText: "" }
        : extractOperationalInputParts(normalizedIncomingText);
    const incomingHasAddress =
        !incomingHasLocation &&
        (Boolean(incomingOperationalInput.addressText) || looksLikeAddress(normalizedIncomingText));
    const incomingHasReference =
        !incomingHasLocation &&
        (Boolean(incomingOperationalInput.referenceText) || looksLikeReference(normalizedIncomingText));

    const incomingMessages = typedMessages.filter((m) => m.direction === "in");
    const latestAddressText =
        incomingOperationalInput.addressText ||
        extractLatestOperationalText(incomingMessages, looksLikeAddress);
    const latestReferenceText =
        incomingOperationalInput.referenceText ||
        extractLatestOperationalText(incomingMessages, looksLikeReference);
    const latestGpsLocation = extractLatestGpsLocation(incomingMessages);

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

    const typedChatContext = (chatContext || null) as ChatContextRecord | null;
    const latestOutboundMessage = typedMessages.find((m) => m.direction === "out");
    const latestOutboundText =
        typeof latestOutboundMessage?.text === "string" ? latestOutboundMessage.text : "";
    const cartSnapshotMeta = readCartSnapshotMeta(typedChatContext?.cart_snapshot);

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
        const triggerText = params.mediaBase64 ? "[Mensagem de Áudio]" : (normalizedIncomingText || `[Roleta: ${typedChatContext?.cupom_ganho || "Premio Ativado"}] ${contextoTemporal}`);
        const parts: Part[] = [{ text: triggerText }];

        if (params.mediaBase64 && params.mediaMimeType) {
            parts.push({
                inlineData: {
                    data: params.mediaBase64,
                    mimeType: params.mediaMimeType,
                },
            });
        }

        geminiHistory.push({ role: "user", parts });
    } else if (geminiHistory[geminiHistory.length - 1].role === "model") {
        const triggerText = params.mediaBase64 ? "[Mensagem de Áudio]" : (normalizedIncomingText || "");
        const parts: Part[] = [{ text: triggerText }];

        if (params.mediaBase64 && params.mediaMimeType) {
            parts.push({
                inlineData: {
                    data: params.mediaBase64,
                    mimeType: params.mediaMimeType,
                },
            });
        }

        geminiHistory.push({ role: "user", parts });
    }

    const fallbackPrompt = "Voce e o Vendedor Ativo de Alta Conversao do restaurante {nome_restaurante}. Seja proativo: faca upsell e cross-sell oferecendo acompanhamentos e bebidas usando OS BOTOES INTERATIVOS. Seja persuasivo e facilite o 'SIM' do cliente com recomendacoes claras e rapidas.";
    const storedPrompt = restData?.system_prompt || fallbackPrompt;
    const promptSanitization = sanitizeStoredSystemPrompt(storedPrompt);
    const rawPrompt = promptSanitization.prompt || fallbackPrompt;
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

    const heuristicSentiment = detectSentiment(baseConversationContext);
    const userTurnCount = baseConversationContext.filter((message) => message.role === "user").length;
    const shouldRunSentimentLlm =
        userTurnCount > 0 && userTurnCount % SENTIMENT_LLM_EVERY_N_TURNS === 0;

    void (async () => {
        let finalSentiment: SentimentLabel = heuristicSentiment;
        let source: "heuristic" | "hybrid_llm" = "heuristic";

        if (shouldRunSentimentLlm) {
            const llmSentiment = await classifySentimentWithLlm(baseConversationContext);
            if (llmSentiment) {
                finalSentiment = llmSentiment;
                source = "hybrid_llm";
            }
        }

        const { error } = await supabase
            .from("chats")
            .update({
                sentiment: finalSentiment,
                last_activity_at: new Date().toISOString(),
            })
            .eq("id", params.chatId);

        if (error) {
            console.error("[AI ROADMAP 2.0] Failed to update chat sentiment/activity:", error.message);
            return;
        }

        logAiEvent("sentiment_updated", {
            chatId: params.chatId,
            sentiment: finalSentiment,
            source,
            userTurnCount,
        });
    })();

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
        playbookVertical: restaurantPlaybook.vertical,
        playbookCategories: restaurantPlaybook.availableCategories,
        heuristicSentiment,
        sentimentLlmScheduled: shouldRunSentimentLlm,
        triggerMessageCreatedAt: latestInboundMessage?.created_at || null,
        promptSanitized: promptSanitization.sanitized,
        promptSanitizationReason: promptSanitization.reason,
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
        base_url: APP_URL,
        trigger_message_created_at: latestInboundMessage?.created_at || undefined,
    };

    let loopActive = true;
    let iteration = 0;
    const MAX_ITERATIONS = 5;
    const turnMetrics = createAiTurnMetrics();
    let emptyResponseRetried = false;
    const immediatePostLocationFollowUp = buildPostLocationFollowUpMessage({
        incomingHasLocation,
        addressConfirmed,
        referenceConfirmed,
    });
    const immediateRoulettePrizePrompt =
        isRoulettePrizeTrigger(normalizedIncomingText) && !cartSnapshotMeta.hasItems;
    const immediateRouletteChoice = detectRouletteChoiceIntent({
        latestInboundText: normalizedIncomingText,
        latestOutboundText,
        hasCartItems: cartSnapshotMeta.hasItems,
    });
    const immediateDelayedCouponFollowUp = shouldHandleDelayedCouponDeferral({
        latestInboundText: normalizedIncomingText,
        latestOutboundText,
        hasCartItems: cartSnapshotMeta.hasItems,
    });
    const immediateAddToCartAction = parseAddToCartClientAction(normalizedIncomingText);
    const immediateOperationalCalculation = shouldAutoCalculateAfterOperationalInput({
        latestOutboundText,
        receivedOperationalInput:
            incomingHasLocation || incomingHasAddress || incomingHasReference,
        hasCartItems: cartSnapshotMeta.hasItems,
        locationConfirmed,
        addressConfirmed,
        referenceConfirmed,
        hasPaymentMethod: cartSnapshotMeta.hasPaymentMethod,
        hasOrder: cartSnapshotMeta.hasOrder,
    });
    const immediateSalesObjection = detectSalesObjectionIntent({
        latestInboundText: normalizedIncomingText,
        latestOutboundText,
        hasCartItems: cartSnapshotMeta.hasItems,
        hasPrincipal: cartSnapshotMeta.hasPrincipal,
        hasAdditional: cartSnapshotMeta.hasAdditional,
        hasDrink: cartSnapshotMeta.hasDrink,
        hasPaymentMethod: cartSnapshotMeta.hasPaymentMethod,
        hasOrder: cartSnapshotMeta.hasOrder,
        preferredDomain: restaurantPlaybook.vertical,
        availability: restaurantPlaybook.availableCategories,
    });
    const inboundIsNeutralWithoutCatalogIntent =
        isNeutralInboundWithoutCatalogIntent(normalizedIncomingText);

    const toolInvocationFingerprints = new Set<string>();
    const turnEvidence = {
        hasFreightCalculation: false,
        hasPixQuote: false,
    };

    if (immediatePostLocationFollowUp) {
        const sendResult = await sendTextMessage(
            params.waChatId,
            immediatePostLocationFollowUp,
            instanceToken
        );

        if (!wasOutboundDeliveryAccepted(sendResult)) {
            console.error("[AI LOOP] Immediate post-location follow-up failed", {
                chatId: params.chatId,
                result: sendResult,
            });
            logAiEvent("outbound_text_failed", {
                chatId: params.chatId,
                endpoint: sendResult.endpoint || "/send/text",
                status: sendResult.status || null,
                error: sendResult.error || null,
                autoTriggeredBy: "location_shared",
            });
            markTextFailed(turnMetrics);
        } else {
            logAiEvent("outbound_text_sent", {
                chatId: params.chatId,
                endpoint: sendResult.endpoint || "/send/text",
                status: sendResult.status || null,
                textLength: immediatePostLocationFollowUp.length,
                autoTriggeredBy: "location_shared",
            });
            markTextSent(turnMetrics);
            await persistOutgoingMessage(supabase, params, immediatePostLocationFollowUp);
        }

        const turnSummary = buildAiTurnSummary(turnMetrics, {
            maxIterationsReached: false,
        });
        const metricsPersisted = await persistAiTurnMetrics(supabase, params, turnSummary);
        logAiEvent("process_completed", {
            chatId: params.chatId,
            metricsPersisted,
            ...turnSummary,
        });
        return;
    }

    if (
        immediateSalesObjection &&
        !immediateRoulettePrizePrompt &&
        !immediateRouletteChoice &&
        !immediateDelayedCouponFollowUp &&
        !immediateAddToCartAction &&
        !incomingHasLocation &&
        !incomingHasAddress &&
        !incomingHasReference &&
        !locationConfirmed &&
        !cartSnapshotMeta.hasPaymentMethod &&
        !cartSnapshotMeta.hasOrder
    ) {
        const objectionSearchRaw = await executeAiTool(
            "search_product_catalog",
            { category: immediateSalesObjection.category },
            ctx
        );
        const objectionSearchResult = asRecord(JSON.parse(objectionSearchRaw));
        const objectionProducts = asProductList(objectionSearchResult?.products);
        markToolCompleted(turnMetrics, {
            toolName: "search_product_catalog",
            blocked: false,
            skipped: false,
            ok: objectionSearchResult?.ok === true,
        });

        const objectionPitch = buildObjectionRecoveryPitch({
            category: immediateSalesObjection.category,
            isPriceObjection: immediateSalesObjection.isPriceObjection,
            cupomGanho,
        });

        if (objectionProducts.length > 0) {
            const objectionCarouselRaw = await executeAiTool(
                "send_uaz_carousel",
                {
                    products: objectionProducts,
                    text: objectionPitch,
                },
                ctx
            );
            const objectionCarouselResult = asRecord(JSON.parse(objectionCarouselRaw));
            const objectionCarouselPayload = asRecord(
                objectionCarouselResult?.uazapi_payload
            );
            markToolCompleted(turnMetrics, {
                toolName: "send_uaz_carousel",
                blocked: false,
                skipped: false,
                ok: objectionCarouselResult?.ok === true,
            });

            if (objectionCarouselPayload) {
                const duplicatePayload = await wasOutgoingPayloadAlreadySent(
                    supabase,
                    params.chatId,
                    objectionCarouselPayload,
                    ctx.trigger_message_created_at
                );

                if (!duplicatePayload) {
                    const objectionPayloadSend = await sendRichPayload(
                        objectionCarouselPayload,
                        instanceToken
                    );

                    if (wasOutboundDeliveryAccepted(objectionPayloadSend)) {
                        logAiEvent("outbound_payload_sent", {
                            chatId: params.chatId,
                            endpoint: objectionPayloadSend.endpoint || null,
                            status: objectionPayloadSend.status || null,
                            delivered: true,
                            autoTriggeredBy: "sales_objection_recovery",
                            category: immediateSalesObjection.category,
                        });
                        markPayloadSent(turnMetrics);
                        await persistOutgoingMessage(
                            supabase,
                            params,
                            typeof objectionCarouselPayload.text === "string"
                                ? objectionCarouselPayload.text
                                : objectionPitch,
                            objectionCarouselPayload
                        );
                    } else {
                        markPayloadFailed(turnMetrics);
                        const fallbackTextResult = await sendTextMessage(
                            params.waChatId,
                            objectionPitch,
                            instanceToken
                        );
                        if (wasOutboundDeliveryAccepted(fallbackTextResult)) {
                            markTextSent(turnMetrics);
                            await persistOutgoingMessage(supabase, params, objectionPitch);
                        } else {
                            markTextFailed(turnMetrics);
                        }
                    }

                    const turnSummary = buildAiTurnSummary(turnMetrics, {
                        maxIterationsReached: false,
                    });
                    const metricsPersisted = await persistAiTurnMetrics(
                        supabase,
                        params,
                        turnSummary
                    );
                    logAiEvent("process_completed", {
                        chatId: params.chatId,
                        metricsPersisted,
                        ...turnSummary,
                    });
                    return;
                }
            }
        }

        const objectionFallbackResult = await sendTextMessage(
            params.waChatId,
            objectionPitch,
            instanceToken
        );
        if (wasOutboundDeliveryAccepted(objectionFallbackResult)) {
            markTextSent(turnMetrics);
            await persistOutgoingMessage(supabase, params, objectionPitch);
        } else {
            markTextFailed(turnMetrics);
        }

        const turnSummary = buildAiTurnSummary(turnMetrics, {
            maxIterationsReached: false,
        });
        const metricsPersisted = await persistAiTurnMetrics(supabase, params, turnSummary);
        logAiEvent("process_completed", {
            chatId: params.chatId,
            metricsPersisted,
            ...turnSummary,
        });
        return;
    }

    const shouldAvoidNeutralCatalogReopen =
        inboundIsNeutralWithoutCatalogIntent &&
        !immediateRoulettePrizePrompt &&
        !immediateRouletteChoice &&
        !immediateDelayedCouponFollowUp &&
        !immediateAddToCartAction &&
        /montando pedido/i.test(String(kanbanStatus || "")) &&
        !cartSnapshotMeta.hasItems &&
        !locationConfirmed;

    if (shouldAvoidNeutralCatalogReopen) {
        const neutralReopenText =
            "Bora fechar seu pedido: me manda o principal que voce quer e eu sigo na sequencia com adicional e bebida.";
        const neutralReopenResult = await sendTextMessage(
            params.waChatId,
            neutralReopenText,
            instanceToken
        );
        if (wasOutboundDeliveryAccepted(neutralReopenResult)) {
            markTextSent(turnMetrics);
            await persistOutgoingMessage(supabase, params, neutralReopenText);
        } else {
            markTextFailed(turnMetrics);
        }

        const turnSummary = buildAiTurnSummary(turnMetrics, {
            maxIterationsReached: false,
        });
        const metricsPersisted = await persistAiTurnMetrics(supabase, params, turnSummary);
        logAiEvent("process_completed", {
            chatId: params.chatId,
            metricsPersisted,
            ...turnSummary,
        });
        return;
    }

    if (
        locationConfirmed &&
        cartSnapshotMeta.hasItems &&
        !immediateOperationalCalculation &&
        !cartSnapshotMeta.hasPaymentMethod &&
        !cartSnapshotMeta.hasOrder &&
        (incomingHasAddress || incomingHasReference)
    ) {
        const missingOperationalText = buildPostLocationFollowUpMessage({
            incomingHasLocation: true,
            addressConfirmed,
            referenceConfirmed,
        });

        if (missingOperationalText) {
            const sendResult = await sendTextMessage(
                params.waChatId,
                missingOperationalText,
                instanceToken
            );

            if (wasOutboundDeliveryAccepted(sendResult)) {
                logAiEvent("outbound_text_sent", {
                    chatId: params.chatId,
                    endpoint: sendResult.endpoint || "/send/text",
                    status: sendResult.status || null,
                    textLength: missingOperationalText.length,
                    autoTriggeredBy: "operational_input_incomplete",
                });
                markTextSent(turnMetrics);
                await persistOutgoingMessage(supabase, params, missingOperationalText);
            } else {
                logAiEvent("outbound_text_failed", {
                    chatId: params.chatId,
                    endpoint: sendResult.endpoint || "/send/text",
                    status: sendResult.status || null,
                    error: sendResult.error || null,
                    autoTriggeredBy: "operational_input_incomplete",
                });
                markTextFailed(turnMetrics);
            }

            const turnSummary = buildAiTurnSummary(turnMetrics, {
                maxIterationsReached: false,
            });
            const metricsPersisted = await persistAiTurnMetrics(supabase, params, turnSummary);
            logAiEvent("process_completed", {
                chatId: params.chatId,
                metricsPersisted,
                ...turnSummary,
            });
            return;
        }
    }

    if (immediateOperationalCalculation) {
        const cartItemsForCalculation = getCartItemsFromSnapshot(
            typedChatContext?.cart_snapshot
        );

        if (cartItemsForCalculation.length > 0) {
            logAiEvent("auto_freight_calculation_triggered", {
                chatId: params.chatId,
                itemsCount: cartItemsForCalculation.length,
                hasGpsLocation: Boolean(latestGpsLocation),
                hasAddressText: Boolean(latestAddressText),
                hasReferenceText: Boolean(latestReferenceText),
            });

            const calculationArgs: Record<string, unknown> = {
                items: cartItemsForCalculation,
            };

            if (latestAddressText) {
                calculationArgs.customer_address = latestAddressText;
            }

            if (latestGpsLocation) {
                calculationArgs.gps_location = latestGpsLocation;
            }

            const calculationRaw = await executeAiTool(
                "calculate_cart_total",
                calculationArgs,
                ctx
            );

            let calculationResult: Record<string, unknown> | null = null;
            try {
                calculationResult = asRecord(JSON.parse(calculationRaw));
            } catch {
                calculationResult = null;
            }

            markToolCompleted(turnMetrics, {
                toolName: "calculate_cart_total",
                blocked: false,
                skipped: calculationResult?.skipped === true,
                ok: calculationResult?.ok === true,
            });

            if (calculationResult?.ok === true) {
                turnEvidence.hasFreightCalculation = true;

                const summaryText = buildCartTotalSummaryText(calculationResult);
                const summarySendResult = await sendTextMessage(
                    params.waChatId,
                    summaryText,
                    instanceToken
                );

                if (wasOutboundDeliveryAccepted(summarySendResult)) {
                    logAiEvent("outbound_text_sent", {
                        chatId: params.chatId,
                        endpoint: summarySendResult.endpoint || "/send/text",
                        status: summarySendResult.status || null,
                        textLength: summaryText.length,
                        autoTriggeredBy: "operational_ready_calculation",
                    });
                    markTextSent(turnMetrics);
                    await persistOutgoingMessage(supabase, params, summaryText);
                } else {
                    logAiEvent("outbound_text_failed", {
                        chatId: params.chatId,
                        endpoint: summarySendResult.endpoint || "/send/text",
                        status: summarySendResult.status || null,
                        error: summarySendResult.error || null,
                        autoTriggeredBy: "operational_ready_calculation",
                    });
                    markTextFailed(turnMetrics);
                }

                const storeOpenForCheckout = await isStoreOpenForCheckout(ctx);
                if (!storeOpenForCheckout) {
                    const closedStageMoveRaw = await executeAiTool(
                        "move_kanban_stage",
                        { stage_name: "Atendimento Humano" },
                        ctx
                    );

                    try {
                        const closedStageMoveResult = asRecord(
                            JSON.parse(closedStageMoveRaw)
                        );
                        markToolCompleted(turnMetrics, {
                            toolName: "move_kanban_stage",
                            blocked: false,
                            skipped: closedStageMoveResult?.skipped === true,
                            ok: closedStageMoveResult?.ok === true,
                        });
                    } catch {
                        // ignore metric parse issue
                    }

                    const closedStoreText =
                        "A loja esta fechada no momento. Vou encaminhar seu atendimento para nossa equipe continuar com voce na reabertura.";
                    const closedStoreSendResult = await sendTextMessage(
                        params.waChatId,
                        closedStoreText,
                        instanceToken
                    );

                    if (wasOutboundDeliveryAccepted(closedStoreSendResult)) {
                        logAiEvent("outbound_text_sent", {
                            chatId: params.chatId,
                            endpoint: closedStoreSendResult.endpoint || "/send/text",
                            status: closedStoreSendResult.status || null,
                            textLength: closedStoreText.length,
                            autoTriggeredBy: "store_closed_before_checkout",
                        });
                        markTextSent(turnMetrics);
                        await persistOutgoingMessage(
                            supabase,
                            params,
                            closedStoreText
                        );
                    } else {
                        logAiEvent("outbound_text_failed", {
                            chatId: params.chatId,
                            endpoint: closedStoreSendResult.endpoint || "/send/text",
                            status: closedStoreSendResult.status || null,
                            error: closedStoreSendResult.error || null,
                            autoTriggeredBy: "store_closed_before_checkout",
                        });
                        markTextFailed(turnMetrics);
                    }

                    const turnSummary = buildAiTurnSummary(turnMetrics, {
                        maxIterationsReached: false,
                    });
                    const metricsPersisted = await persistAiTurnMetrics(
                        supabase,
                        params,
                        turnSummary
                    );
                    logAiEvent("process_completed", {
                        chatId: params.chatId,
                        metricsPersisted,
                        ...turnSummary,
                    });
                    return;
                }

                const paymentToolRaw = await executeAiTool(
                    "send_uaz_buttons",
                    {
                        text: "Como prefere pagar?",
                        choices: ["PIX", "Dinheiro", "Cartao"],
                        footerText: "Escolha uma opcao",
                    },
                    ctx
                );

                let paymentToolResult: Record<string, unknown> | null = null;
                try {
                    paymentToolResult = asRecord(JSON.parse(paymentToolRaw));
                } catch {
                    paymentToolResult = null;
                }

                markToolCompleted(turnMetrics, {
                    toolName: "send_uaz_buttons",
                    blocked: false,
                    skipped: paymentToolResult?.skipped === true,
                    ok: paymentToolResult?.ok === true,
                });

                const paymentPayload = asRecord(paymentToolResult?.uazapi_payload);
                if (paymentPayload) {
                    const payloadSendResult = await sendRichPayload(
                        paymentPayload,
                        instanceToken
                    );

                    if (wasOutboundDeliveryAccepted(payloadSendResult)) {
                        logAiEvent("outbound_payload_sent", {
                            chatId: params.chatId,
                            endpoint: payloadSendResult.endpoint || null,
                            status: payloadSendResult.status || null,
                            delivered: true,
                            autoTriggeredBy: "operational_ready_payment",
                        });
                        markPayloadSent(turnMetrics);
                        await persistOutgoingMessage(
                            supabase,
                            params,
                            typeof paymentPayload.text === "string"
                                ? paymentPayload.text
                                : "Como prefere pagar?",
                            paymentPayload
                        );
                    } else {
                        logAiEvent("outbound_payload_failed", {
                            chatId: params.chatId,
                            endpoint: payloadSendResult.endpoint || null,
                            status: payloadSendResult.status || null,
                            error: payloadSendResult.error || null,
                            autoTriggeredBy: "operational_ready_payment",
                        });
                        markPayloadFailed(turnMetrics);

                        const fallbackPaymentText =
                            typeof paymentPayload.text === "string"
                                ? paymentPayload.text
                                : "Como prefere pagar? PIX, Dinheiro ou Cartao.";
                        const fallbackTextResult = await sendTextMessage(
                            params.waChatId,
                            fallbackPaymentText,
                            instanceToken
                        );

                        if (wasOutboundDeliveryAccepted(fallbackTextResult)) {
                            logAiEvent("outbound_text_sent", {
                                chatId: params.chatId,
                                endpoint: fallbackTextResult.endpoint || "/send/text",
                                status: fallbackTextResult.status || null,
                                textLength: fallbackPaymentText.length,
                                autoTriggeredBy: "operational_ready_payment_fallback",
                            });
                            markTextSent(turnMetrics);
                            await persistOutgoingMessage(
                                supabase,
                                params,
                                fallbackPaymentText
                            );
                        } else {
                            markTextFailed(turnMetrics);
                        }
                    }
                }

                const turnSummary = buildAiTurnSummary(turnMetrics, {
                    maxIterationsReached: false,
                });
                const metricsPersisted = await persistAiTurnMetrics(
                    supabase,
                    params,
                    turnSummary
                );
                logAiEvent("process_completed", {
                    chatId: params.chatId,
                    metricsPersisted,
                    ...turnSummary,
                });
                return;
            }
        }
    }

    if (immediateRoulettePrizePrompt) {
        const promptText = cupomGanho && cupomGanho.toLowerCase() !== "nenhum"
            ? `Parabens! Seu premio ${cupomGanho} esta ativo. Escolha como usar: agora ou outro dia.`
            : "Parabens pelo seu premio! Escolha como usar: agora ou outro dia.";
        const choiceToolRaw = await executeAiTool(
            "send_uaz_buttons",
            {
                text: promptText,
                choices: ["Usar agora", "Usar outro dia"],
                footerText: "Escolha uma opcao",
            },
            ctx
        );

        try {
            const choiceToolResult = asRecord(JSON.parse(choiceToolRaw));
            const choicePayload = asRecord(choiceToolResult?.uazapi_payload);
            if (choicePayload) {
                const payloadSendResult = await sendRichPayload(choicePayload, instanceToken);
                if (wasOutboundDeliveryAccepted(payloadSendResult)) {
                    logAiEvent("outbound_payload_sent", {
                        chatId: params.chatId,
                        endpoint: payloadSendResult.endpoint || null,
                        status: payloadSendResult.status || null,
                        delivered: true,
                        autoTriggeredBy: "roulette_prize_prompt",
                    });
                    markPayloadSent(turnMetrics);
                    await persistOutgoingMessage(
                        supabase,
                        params,
                        typeof choicePayload.text === "string" ? choicePayload.text : promptText,
                        choicePayload
                    );
                } else {
                    logAiEvent("outbound_payload_failed", {
                        chatId: params.chatId,
                        endpoint: payloadSendResult.endpoint || null,
                        status: payloadSendResult.status || null,
                        error: payloadSendResult.error || null,
                        autoTriggeredBy: "roulette_prize_prompt",
                    });
                    markPayloadFailed(turnMetrics);

                    const fallbackTextResult = await sendTextMessage(
                        params.waChatId,
                        promptText,
                        instanceToken
                    );
                    if (wasOutboundDeliveryAccepted(fallbackTextResult)) {
                        logAiEvent("outbound_text_sent", {
                            chatId: params.chatId,
                            endpoint: fallbackTextResult.endpoint || "/send/text",
                            status: fallbackTextResult.status || null,
                            textLength: promptText.length,
                            autoTriggeredBy: "roulette_prize_prompt_fallback",
                        });
                        markTextSent(turnMetrics);
                        await persistOutgoingMessage(supabase, params, promptText);
                    } else {
                        markTextFailed(turnMetrics);
                    }
                }

                const turnSummary = buildAiTurnSummary(turnMetrics, {
                    maxIterationsReached: false,
                });
                const metricsPersisted = await persistAiTurnMetrics(supabase, params, turnSummary);
                logAiEvent("process_completed", {
                    chatId: params.chatId,
                    metricsPersisted,
                    ...turnSummary,
                });
                return;
            }
        } catch {
            // fallback below
        }

        const fallbackTextResult = await sendTextMessage(
            params.waChatId,
            promptText,
            instanceToken
        );
        if (wasOutboundDeliveryAccepted(fallbackTextResult)) {
            logAiEvent("outbound_text_sent", {
                chatId: params.chatId,
                endpoint: fallbackTextResult.endpoint || "/send/text",
                status: fallbackTextResult.status || null,
                textLength: promptText.length,
                autoTriggeredBy: "roulette_prize_prompt_fallback",
            });
            markTextSent(turnMetrics);
            await persistOutgoingMessage(supabase, params, promptText);
        } else {
            markTextFailed(turnMetrics);
        }

        const turnSummary = buildAiTurnSummary(turnMetrics, {
            maxIterationsReached: false,
        });
        const metricsPersisted = await persistAiTurnMetrics(supabase, params, turnSummary);
        logAiEvent("process_completed", {
            chatId: params.chatId,
            metricsPersisted,
            ...turnSummary,
        });
        return;
    }

    if (immediateAddToCartAction) {
        const updatedSnapshot = await persistCartSelectionFromAction(
            supabase,
            params,
            typedChatContext?.cart_snapshot ?? null,
            immediateAddToCartAction
        );
        const updatedSnapshotMeta = readCartSnapshotMeta(updatedSnapshot);

        const postAddPlan = buildPostAddToCartSalesPlan({
            addedCategory: immediateAddToCartAction.category,
            addedProductName: immediateAddToCartAction.productName,
            latestOutboundText,
            hasAdditional: updatedSnapshotMeta.hasAdditional,
            hasDrink: updatedSnapshotMeta.hasDrink,
            preferredDomain: restaurantPlaybook.vertical,
            availability: restaurantPlaybook.availableCategories,
        });

        const nextCategory: "principal" | "adicional" | "bebida" | null = postAddPlan.nextCategory;
        const followupText = postAddPlan.followupText;
        const nextQuery = postAddPlan.searchQuery;

        if (nextCategory) {
            const categorySearchArgs: Record<string, unknown> = { category: nextCategory };
            if (nextQuery) {
                categorySearchArgs.query = nextQuery;
            }
            const searchRaw = await executeAiTool(
                "search_product_catalog",
                categorySearchArgs,
                ctx
            );
            const searchResult = asRecord(JSON.parse(searchRaw));
            const categoryProducts = asProductList(searchResult?.products);
            markToolCompleted(turnMetrics, {
                toolName: "search_product_catalog",
                blocked: false,
                skipped: false,
                ok: searchResult?.ok === true,
            });

            if (categoryProducts.length > 0) {
                const carouselRaw = await executeAiTool(
                    "send_uaz_carousel",
                    {
                        products: categoryProducts,
                        text: followupText,
                    },
                    ctx
                );
                const carouselResult = asRecord(JSON.parse(carouselRaw));
                const carouselPayload = asRecord(carouselResult?.uazapi_payload);
                markToolCompleted(turnMetrics, {
                    toolName: "send_uaz_carousel",
                    blocked: false,
                    skipped: false,
                    ok: carouselResult?.ok === true,
                });

                if (
                    carouselPayload &&
                    !(
                        await wasOutgoingPayloadAlreadySent(
                            supabase,
                            params.chatId,
                            carouselPayload,
                            ctx.trigger_message_created_at
                        )
                    )
                ) {
                    if (
                        await wasTurnSupersededByNewInbound(
                            supabase,
                            params.chatId,
                            ctx.trigger_message_created_at
                        )
                    ) {
                        logAiEvent("auto_carousel_skipped", {
                            chatId: params.chatId,
                            reason: "STALE_TURN_SUPERSEDED",
                            autoTriggeredBy: "add_to_cart_progression",
                            category: nextCategory,
                        });
                        const turnSummary = buildAiTurnSummary(turnMetrics, {
                            maxIterationsReached: false,
                        });
                        const metricsPersisted = await persistAiTurnMetrics(
                            supabase,
                            params,
                            turnSummary
                        );
                        logAiEvent("process_completed", {
                            chatId: params.chatId,
                            metricsPersisted,
                            ...turnSummary,
                        });
                        return;
                    }

                    const payloadSendResult = await sendRichPayload(
                        carouselPayload,
                        instanceToken
                    );
                    if (wasOutboundDeliveryAccepted(payloadSendResult)) {
                        logAiEvent("outbound_payload_sent", {
                            chatId: params.chatId,
                            endpoint: payloadSendResult.endpoint || null,
                            status: payloadSendResult.status || null,
                            delivered: true,
                            autoTriggeredBy: "add_to_cart_progression",
                            category: nextCategory,
                        });
                        markPayloadSent(turnMetrics);
                        await persistOutgoingMessage(
                            supabase,
                            params,
                            typeof carouselPayload.text === "string"
                                ? carouselPayload.text
                                : followupText,
                            carouselPayload
                        );
                        const turnSummary = buildAiTurnSummary(turnMetrics, {
                            maxIterationsReached: false,
                        });
                        const metricsPersisted = await persistAiTurnMetrics(
                            supabase,
                            params,
                            turnSummary
                        );
                        logAiEvent("process_completed", {
                            chatId: params.chatId,
                            metricsPersisted,
                            ...turnSummary,
                        });
                        return;
                    }
                    markPayloadFailed(turnMetrics);
                }
            }
        }

        const addFallbackResult = await sendTextMessage(
            params.waChatId,
            followupText,
            instanceToken
        );
        if (wasOutboundDeliveryAccepted(addFallbackResult)) {
            markTextSent(turnMetrics);
            await persistOutgoingMessage(supabase, params, followupText);
        } else {
            markTextFailed(turnMetrics);
        }

        const turnSummary = buildAiTurnSummary(turnMetrics, {
            maxIterationsReached: false,
        });
        const metricsPersisted = await persistAiTurnMetrics(supabase, params, turnSummary);
        logAiEvent("process_completed", {
            chatId: params.chatId,
            metricsPersisted,
            ...turnSummary,
        });
        return;
    }

    if (immediateRouletteChoice === "use_later") {
        const stageMoveRaw = await executeAiTool(
            "move_kanban_stage",
            { stage_name: "Agendamento" },
            ctx
        );
        try {
            const stageMoveResult = asRecord(JSON.parse(stageMoveRaw));
            markToolCompleted(turnMetrics, {
                toolName: "move_kanban_stage",
                blocked: false,
                skipped: stageMoveResult?.skipped === true,
                ok: stageMoveResult?.ok === true,
            });
        } catch {
            // ignore metric parse issue
        }

        const followUpText =
            "Fechou. Qual dia e horario ficam melhores para voce usar seu cupom?";
        const sendResult = await sendTextMessage(
            params.waChatId,
            followUpText,
            instanceToken
        );

        if (wasOutboundDeliveryAccepted(sendResult)) {
            logAiEvent("outbound_text_sent", {
                chatId: params.chatId,
                endpoint: sendResult.endpoint || "/send/text",
                status: sendResult.status || null,
                textLength: followUpText.length,
                autoTriggeredBy: "roulette_use_later",
            });
            markTextSent(turnMetrics);
            await persistOutgoingMessage(supabase, params, followUpText);
        } else {
            markTextFailed(turnMetrics);
        }

        const turnSummary = buildAiTurnSummary(turnMetrics, {
            maxIterationsReached: false,
        });
        const metricsPersisted = await persistAiTurnMetrics(supabase, params, turnSummary);
        logAiEvent("process_completed", {
            chatId: params.chatId,
            metricsPersisted,
            ...turnSummary,
        });
        return;
    }

    if (immediateRouletteChoice === "use_now") {
        const storeInfoRaw = await executeAiTool("get_store_info", {}, ctx);
        const storeInfoResult = asRecord(JSON.parse(storeInfoRaw));
        const storeInfo = asRecord(storeInfoResult?.store_info);
        const isOpenNow = storeInfo?.is_open_now === true;
        markToolCompleted(turnMetrics, {
            toolName: "get_store_info",
            blocked: false,
            skipped: false,
            ok: storeInfoResult?.ok === true,
        });

        if (!isOpenNow) {
            const closedText =
                "Ainda nao estamos abertos agora. Mas seu premio esta garantido. Quer agendar para mais tarde ou outro dia?";
            const sendResult = await sendTextMessage(
                params.waChatId,
                closedText,
                instanceToken
            );
            if (wasOutboundDeliveryAccepted(sendResult)) {
                logAiEvent("outbound_text_sent", {
                    chatId: params.chatId,
                    endpoint: sendResult.endpoint || "/send/text",
                    status: sendResult.status || null,
                    textLength: closedText.length,
                    autoTriggeredBy: "roulette_use_now_closed",
                });
                markTextSent(turnMetrics);
                await persistOutgoingMessage(supabase, params, closedText);
            } else {
                markTextFailed(turnMetrics);
            }

            const turnSummary = buildAiTurnSummary(turnMetrics, {
                maxIterationsReached: false,
            });
            const metricsPersisted = await persistAiTurnMetrics(supabase, params, turnSummary);
            logAiEvent("process_completed", {
                chatId: params.chatId,
                metricsPersisted,
                ...turnSummary,
            });
            return;
        }

        const stageMoveRaw = await executeAiTool(
            "move_kanban_stage",
            { stage_name: "Montando Pedido" },
            ctx
        );
        try {
            const stageMoveResult = asRecord(JSON.parse(stageMoveRaw));
            markToolCompleted(turnMetrics, {
                toolName: "move_kanban_stage",
                blocked: false,
                skipped: stageMoveResult?.skipped === true,
                ok: stageMoveResult?.ok === true,
            });
        } catch {
            // ignore metric parse issue
        }

        const searchRaw = await executeAiTool(
            "search_product_catalog",
            { category: "principal" },
            ctx
        );
        const searchResult = asRecord(JSON.parse(searchRaw));
        const searchedProducts = asProductList(searchResult?.products);
        markToolCompleted(turnMetrics, {
            toolName: "search_product_catalog",
            blocked: false,
            skipped: false,
            ok: searchResult?.ok === true,
        });

        if (searchedProducts.length > 0) {
            const carouselRaw = await executeAiTool(
                "send_uaz_carousel",
                {
                    products: searchedProducts,
                    text: buildActiveCategoryPitch("principal", cupomGanho),
                },
                ctx
            );
            try {
                const carouselResult = asRecord(JSON.parse(carouselRaw));
                const carouselPayload = asRecord(carouselResult?.uazapi_payload);
                markToolCompleted(turnMetrics, {
                    toolName: "send_uaz_carousel",
                    blocked: false,
                    skipped: false,
                    ok: carouselResult?.ok === true,
                });

                if (carouselPayload) {
                    if (
                        await wasTurnSupersededByNewInbound(
                            supabase,
                            params.chatId,
                            ctx.trigger_message_created_at
                        )
                    ) {
                        logAiEvent("auto_carousel_skipped", {
                            chatId: params.chatId,
                            reason: "STALE_TURN_SUPERSEDED",
                            autoTriggeredBy: "roulette_use_now_open",
                        });
                        const fallbackTextResult = await sendTextMessage(
                            params.waChatId,
                            "Agora estamos abertos. Me chama quando quiser que eu te mostro nossos principais.",
                            instanceToken
                        );
                        if (wasOutboundDeliveryAccepted(fallbackTextResult)) {
                            markTextSent(turnMetrics);
                            await persistOutgoingMessage(
                                supabase,
                                params,
                                "Agora estamos abertos. Me chama quando quiser que eu te mostro nossos principais."
                            );
                        } else {
                            markTextFailed(turnMetrics);
                        }
                        const turnSummary = buildAiTurnSummary(turnMetrics, {
                            maxIterationsReached: false,
                        });
                        const metricsPersisted = await persistAiTurnMetrics(
                            supabase,
                            params,
                            turnSummary
                        );
                        logAiEvent("process_completed", {
                            chatId: params.chatId,
                            metricsPersisted,
                            ...turnSummary,
                        });
                        return;
                    }

                    const payloadSendResult = await sendRichPayload(
                        carouselPayload,
                        instanceToken
                    );
                    if (wasOutboundDeliveryAccepted(payloadSendResult)) {
                        logAiEvent("outbound_payload_sent", {
                            chatId: params.chatId,
                            endpoint: payloadSendResult.endpoint || null,
                            status: payloadSendResult.status || null,
                            delivered: true,
                            autoTriggeredBy: "roulette_use_now_open",
                        });
                        markPayloadSent(turnMetrics);
                        await persistOutgoingMessage(
                            supabase,
                            params,
                            typeof carouselPayload.text === "string"
                                ? carouselPayload.text
                                : buildActiveCategoryPitch("principal", cupomGanho),
                            carouselPayload
                        );
                    } else {
                        logAiEvent("outbound_payload_failed", {
                            chatId: params.chatId,
                            endpoint: payloadSendResult.endpoint || null,
                            status: payloadSendResult.status || null,
                            error: payloadSendResult.error || null,
                            autoTriggeredBy: "roulette_use_now_open",
                        });
                        markPayloadFailed(turnMetrics);
                        const fallbackText = "Agora estamos abertos. Vou te mostrar nossos principais mais pedidos.";
                        const fallbackTextResult = await sendTextMessage(
                            params.waChatId,
                            fallbackText,
                            instanceToken
                        );
                        if (wasOutboundDeliveryAccepted(fallbackTextResult)) {
                            markTextSent(turnMetrics);
                            await persistOutgoingMessage(supabase, params, fallbackText);
                        } else {
                            markTextFailed(turnMetrics);
                        }
                    }

                    const turnSummary = buildAiTurnSummary(turnMetrics, {
                        maxIterationsReached: false,
                    });
                    const metricsPersisted = await persistAiTurnMetrics(supabase, params, turnSummary);
                    logAiEvent("process_completed", {
                        chatId: params.chatId,
                        metricsPersisted,
                        ...turnSummary,
                    });
                    return;
                }
            } catch {
                // fallback below
            }
        }

        const fallbackText =
            "Agora estamos abertos. Me fala o que voce quer comer que eu puxo os principais e sigo com adicional e bebida.";
        const fallbackTextResult = await sendTextMessage(
            params.waChatId,
            fallbackText,
            instanceToken
        );
        if (wasOutboundDeliveryAccepted(fallbackTextResult)) {
            markTextSent(turnMetrics);
            await persistOutgoingMessage(supabase, params, fallbackText);
        } else {
            markTextFailed(turnMetrics);
        }

        const turnSummary = buildAiTurnSummary(turnMetrics, {
            maxIterationsReached: false,
        });
        const metricsPersisted = await persistAiTurnMetrics(supabase, params, turnSummary);
        logAiEvent("process_completed", {
            chatId: params.chatId,
            metricsPersisted,
            ...turnSummary,
        });
        return;
    }

    if (immediateDelayedCouponFollowUp) {
        const stageMoveRaw = await executeAiTool(
            "move_kanban_stage",
            { stage_name: "Agendamento" },
            ctx
        );

        let stageMoveResult: Record<string, unknown> | null = null;
        try {
            stageMoveResult = JSON.parse(stageMoveRaw) as Record<string, unknown>;
        } catch {
            stageMoveResult = null;
        }

        logAiEvent("tool_completed", {
            chatId: params.chatId,
            toolName: "move_kanban_stage",
            blocked: false,
            reason: null,
            ok: stageMoveResult?.ok === true,
            skipped: stageMoveResult?.skipped === true,
            error: typeof stageMoveResult?.error === "string"
                ? stageMoveResult.error
                : null,
            autoTriggeredBy: "delayed_coupon_confirmation",
        });
        markToolCompleted(turnMetrics, {
            toolName: "move_kanban_stage",
            blocked: false,
            skipped: stageMoveResult?.skipped === true,
            ok: stageMoveResult?.ok === true,
        });

        const deferredCouponFollowUpText =
            "Fechou. Qual dia fica melhor para voce usar seu cupom? Se quiser, me fala o dia e um horario aproximado.";
        const sendResult = await sendTextMessage(
            params.waChatId,
            deferredCouponFollowUpText,
            instanceToken
        );

        if (!wasOutboundDeliveryAccepted(sendResult)) {
            console.error("[AI LOOP] Immediate delayed-coupon follow-up failed", {
                chatId: params.chatId,
                result: sendResult,
            });
            logAiEvent("outbound_text_failed", {
                chatId: params.chatId,
                endpoint: sendResult.endpoint || "/send/text",
                status: sendResult.status || null,
                error: sendResult.error || null,
                autoTriggeredBy: "delayed_coupon_confirmation",
            });
            markTextFailed(turnMetrics);
        } else {
            logAiEvent("outbound_text_sent", {
                chatId: params.chatId,
                endpoint: sendResult.endpoint || "/send/text",
                status: sendResult.status || null,
                textLength: deferredCouponFollowUpText.length,
                autoTriggeredBy: "delayed_coupon_confirmation",
            });
            markTextSent(turnMetrics);
            await persistOutgoingMessage(supabase, params, deferredCouponFollowUpText);
        }

        const turnSummary = buildAiTurnSummary(turnMetrics, {
            maxIterationsReached: false,
        });
        const metricsPersisted = await persistAiTurnMetrics(supabase, params, turnSummary);
        logAiEvent("process_completed", {
            chatId: params.chatId,
            metricsPersisted,
            ...turnSummary,
        });
        return;
    }

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
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
            markIterationStarted(turnMetrics);
            logAiEvent("iteration_started", {
                chatId: params.chatId,
                iteration,
                contextMessages: conversationContext.length,
            });

            let response: Awaited<ReturnType<typeof model.generateContent>> | null = null;
            let durationMs = 0;
            try {
                const startTimeMs = Date.now();
                response = await withTimeout(
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
                durationMs = Date.now() - startTimeMs;
            } catch (primaryError: unknown) {
                logAiEvent("llm_primary_failed", {
                    chatId: params.chatId,
                    iteration,
                    model: GEMINI_MODEL_NAME,
                    error: getErrorMessage(primaryError),
                });

                let fallbackResult: OpenAiFallbackResult | null = null;
                const fallbackStartMs = Date.now();
                try {
                    fallbackResult = await generateFallbackTextWithOpenAI({
                        systemInstruction:
                            prefixCacheMode === "enabled"
                                ? promptPlan.stableSystemInstruction
                                : promptPlan.legacySystemInstruction,
                        conversationContext,
                    });
                } catch (fallbackError: unknown) {
                    logAiEvent("llm_fallback_failed", {
                        chatId: params.chatId,
                        iteration,
                        model: OPENAI_FALLBACK_MODEL_NAME,
                        error: getErrorMessage(fallbackError),
                    });
                }

                if (fallbackResult?.text) {
                    const fallbackDurationMs = Date.now() - fallbackStartMs;
                    const normalizedFallback = normalizeOutboundText(
                        stripThoughtBlocks(fallbackResult.text),
                        {
                            restaurantName,
                            kanbanStatus,
                            cupomGanho,
                        }
                    );

                    supabase
                        .from("ai_logs")
                        .insert({
                            restaurant_id: params.restaurantId,
                            chat_id: params.chatId,
                            wa_chat_id: params.waChatId,
                            model: OPENAI_FALLBACK_MODEL_NAME,
                            prompt_tokens: fallbackResult.promptTokens,
                            completion_tokens: fallbackResult.completionTokens,
                            total_tokens: fallbackResult.totalTokens,
                            duration_ms: fallbackDurationMs,
                        })
                        .then(({ error }) => {
                            if (error) console.error("[TELEMETRY] Error:", error.message);
                        });

                    if (normalizedFallback.ok) {
                        const safeFallbackText = normalizedFallback.text;
                        const fallbackSendResult = await sendTextMessage(
                            params.waChatId,
                            safeFallbackText,
                            instanceToken
                        );

                        if (wasOutboundDeliveryAccepted(fallbackSendResult)) {
                            logAiEvent("llm_fallback_text_sent", {
                                chatId: params.chatId,
                                iteration,
                                model: OPENAI_FALLBACK_MODEL_NAME,
                                endpoint: fallbackSendResult.endpoint || "/send/text",
                                status: fallbackSendResult.status || null,
                                textLength: safeFallbackText.length,
                            });
                            markTextSent(turnMetrics);
                            await persistOutgoingMessage(supabase, params, safeFallbackText);
                            loopActive = false;
                            break;
                        }

                        logAiEvent("llm_fallback_text_failed", {
                            chatId: params.chatId,
                            iteration,
                            model: OPENAI_FALLBACK_MODEL_NAME,
                            endpoint: fallbackSendResult.endpoint || "/send/text",
                            status: fallbackSendResult.status || null,
                            error: fallbackSendResult.error || null,
                        });
                        markTextFailed(turnMetrics);
                    } else {
                        logAiEvent("llm_fallback_text_blocked", {
                            chatId: params.chatId,
                            iteration,
                            model: OPENAI_FALLBACK_MODEL_NAME,
                            reason: normalizedFallback.reason,
                        });
                        markOutboundTextBlocked(turnMetrics);
                    }
                }

                const emergencyFallbackText =
                    "Opa, tive uma instabilidade agora. Me manda um OK que eu continuo seu atendimento.";
                const emergencySendResult = await sendTextMessage(
                    params.waChatId,
                    emergencyFallbackText,
                    instanceToken
                );

                if (wasOutboundDeliveryAccepted(emergencySendResult)) {
                    logAiEvent("llm_emergency_fallback_sent", {
                        chatId: params.chatId,
                        iteration,
                        endpoint: emergencySendResult.endpoint || "/send/text",
                        status: emergencySendResult.status || null,
                    });
                    markTextSent(turnMetrics);
                    await persistOutgoingMessage(supabase, params, emergencyFallbackText);
                } else {
                    logAiEvent("llm_emergency_fallback_failed", {
                        chatId: params.chatId,
                        iteration,
                        endpoint: emergencySendResult.endpoint || "/send/text",
                        status: emergencySendResult.status || null,
                        error: emergencySendResult.error || null,
                    });
                    markTextFailed(turnMetrics);
                }

                loopActive = false;
                break;
            }
            if (!response) {
                loopActive = false;
                break;
            }

            const responseMessage = response.response;
            const usage = responseMessage.usageMetadata;

            supabase.from("ai_logs").insert({
                restaurant_id: params.restaurantId,
                chat_id: params.chatId,
                wa_chat_id: params.waChatId,
                model: GEMINI_MODEL_NAME,
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
                    error: typeof parsedToolResultRecord?.error === "string"
                        ? parsedToolResultRecord.error
                        : null,
                    hasUazPayload: Boolean(asRecord(parsedToolResultRecord?.uazapi_payload)),
                    requiresPixPayment: parsedToolResultRecord?.requires_pix_payment === true,
                });
                markToolCompleted(turnMetrics, {
                    toolName,
                    blocked: Boolean(toolBlockReason),
                    skipped: parsedToolResultRecord?.skipped === true,
                    ok: parsedToolResultRecord?.ok === true,
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
                                markPixPayloadSkipped(turnMetrics);
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
                                markPayloadSent(turnMetrics);
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
                            markPayloadFailed(turnMetrics);
                            loopActive = false;
                            break;
                        }
                    } catch {
                        // se falhar o parse, segue o fluxo normal abaixo
                    }
                }

                const parsedUazPayload = asRecord(parsedToolResultRecord?.uazapi_payload);
                if (parsedUazPayload) {
                    if (
                        await wasOutgoingPayloadAlreadySent(
                            supabase,
                            params.chatId,
                            parsedUazPayload,
                            ctx.trigger_message_created_at
                        )
                    ) {
                        logAiEvent("outbound_payload_skipped", {
                            chatId: params.chatId,
                            iteration,
                            toolName,
                            reason: "DUPLICATE_PAYLOAD_IN_CURRENT_TURN",
                        });
                        loopActive = false;
                        break;
                    }

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
                        markPixPayloadSkipped(turnMetrics);
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
                        markPayloadFailed(turnMetrics);

                        const payloadFallbackText =
                            typeof parsedUazPayload.text === "string" &&
                                parsedUazPayload.text.trim().length > 0
                                ? parsedUazPayload.text.trim()
                                : null;

                        if (payloadFallbackText) {
                            const fallbackTextResult = await sendTextMessage(
                                params.waChatId,
                                payloadFallbackText,
                                instanceToken
                            );

                            if (wasOutboundDeliveryAccepted(fallbackTextResult)) {
                                logAiEvent("outbound_text_sent", {
                                    chatId: params.chatId,
                                    iteration,
                                    endpoint: fallbackTextResult.endpoint || "/send/text",
                                    status: fallbackTextResult.status || null,
                                    textLength: payloadFallbackText.length,
                                    autoTriggeredBy: `${toolName}_payload_fallback`,
                                });
                                markTextSent(turnMetrics);
                                await persistOutgoingMessage(
                                    supabase,
                                    params,
                                    payloadFallbackText
                                );
                            } else {
                                logAiEvent("outbound_text_failed", {
                                    chatId: params.chatId,
                                    iteration,
                                    endpoint: fallbackTextResult.endpoint || "/send/text",
                                    status: fallbackTextResult.status || null,
                                    error: fallbackTextResult.error || null,
                                    autoTriggeredBy: `${toolName}_payload_fallback`,
                                });
                                markTextFailed(turnMetrics);
                            }
                        }

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
                    markPayloadSent(turnMetrics);
                    await persistOutgoingMessage(supabase, params, persistedText, parsedUazPayload);
                    loopActive = false;
                    break;
                }

                if (toolName === "search_product_catalog" && parsedToolResultRecord?.ok === true) {
                    const searchedProducts = asProductList(parsedToolResultRecord.products);
                    if (searchedProducts.length > 0) {
                        const shouldPromoteKanbanToAssembly =
                            !cartSnapshotMeta.hasItems &&
                            /novo lead/i.test(String(kanbanStatus || "")) &&
                            /roleta/i.test(String(kanbanStatus || ""));

                        if (shouldPromoteKanbanToAssembly) {
                            const stageMoveRaw = await executeAiTool(
                                "move_kanban_stage",
                                { stage_name: "Montando Pedido" },
                                ctx
                            );
                            try {
                                const stageMoveResult = asRecord(JSON.parse(stageMoveRaw));
                                markToolCompleted(turnMetrics, {
                                    toolName: "move_kanban_stage",
                                    blocked: false,
                                    skipped: stageMoveResult?.skipped === true,
                                    ok: stageMoveResult?.ok === true,
                                });
                            } catch {
                                // ignore metric parse issue
                            }
                        }

                        const carouselToolRaw = await executeAiTool(
                            "send_uaz_carousel",
                            { products: searchedProducts },
                            ctx
                        );

                        try {
                            const carouselToolResult = asRecord(JSON.parse(carouselToolRaw));
                            const carouselPayload = asRecord(carouselToolResult?.uazapi_payload);
                            if (carouselPayload) {
                                if (
                                    await wasTurnSupersededByNewInbound(
                                        supabase,
                                        params.chatId,
                                        ctx.trigger_message_created_at
                                    )
                                ) {
                                    logAiEvent("auto_carousel_skipped", {
                                        chatId: params.chatId,
                                        iteration,
                                        reason: "STALE_TURN_SUPERSEDED",
                                        autoTriggeredBy: "search_product_catalog",
                                    });
                                    loopActive = false;
                                    break;
                                }

                                if (
                                    await wasOutgoingPayloadAlreadySent(
                                        supabase,
                                        params.chatId,
                                        carouselPayload,
                                        ctx.trigger_message_created_at
                                    )
                                ) {
                                    console.warn("[AI LOOP] Duplicate auto-carousel skipped", {
                                        chatId: params.chatId,
                                    });
                                    logAiEvent("auto_carousel_skipped", {
                                        chatId: params.chatId,
                                        iteration,
                                        reason: "DUPLICATE_PAYLOAD_IN_CURRENT_TURN",
                                        autoTriggeredBy: "search_product_catalog",
                                    });
                                    loopActive = false;
                                    break;
                                }

                                const sendResult = await sendRichPayload(carouselPayload, instanceToken);
                                if (wasOutboundDeliveryAccepted(sendResult)) {
                                    markPayloadSent(turnMetrics);
                                    logAiEvent("outbound_payload_sent", {
                                        chatId: params.chatId,
                                        iteration,
                                        toolName: "send_uaz_carousel",
                                        endpoint: sendResult.endpoint || null,
                                        status: sendResult.status || null,
                                        delivered: true,
                                        autoTriggeredBy: "search_product_catalog",
                                    });
                                    await persistOutgoingMessage(
                                        supabase,
                                        params,
                                        typeof carouselPayload.text === "string"
                                            ? carouselPayload.text
                                            : "[send_uaz_carousel]",
                                        carouselPayload
                                    );
                                    loopActive = false;
                                    break;
                                }

                                markPayloadFailed(turnMetrics);
                                logAiEvent("outbound_payload_failed", {
                                    chatId: params.chatId,
                                    iteration,
                                    toolName: "send_uaz_carousel",
                                    endpoint: sendResult.endpoint || null,
                                    status: sendResult.status || null,
                                    error: sendResult.error || null,
                                    autoTriggeredBy: "search_product_catalog",
                                });
                                logAiEvent("auto_carousel_fallback_to_model", {
                                    chatId: params.chatId,
                                    iteration,
                                    reason: "DELIVERY_FAILED",
                                });
                            }
                        } catch {
                            // if the synthetic carousel step fails, continue with the normal model loop
                        }
                    }
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
                    markOutboundTextBlocked(turnMetrics);
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
                    markOutboundTextSanitized(turnMetrics);
                    logAiEvent("outbound_text_sanitized", {
                        chatId: params.chatId,
                        iteration,
                        reason: commercialClaimRisk.reason,
                    });
                }

                const structuredReplyIntent = detectStructuredReplyIntent({
                    text: safeOutboundText,
                    hasCartItems: cartSnapshotMeta.hasItems,
                    locationConfirmed,
                    addressConfirmed,
                    referenceConfirmed,
                    hasFreightCalculation: turnEvidence.hasFreightCalculation,
                    hasPaymentMethod: cartSnapshotMeta.hasPaymentMethod,
                    hasPrincipal: cartSnapshotMeta.hasPrincipal,
                    hasAdditional: cartSnapshotMeta.hasAdditional,
                    hasDrink: cartSnapshotMeta.hasDrink,
                    hasOrder: cartSnapshotMeta.hasOrder,
                });

                if (structuredReplyIntent?.kind === "category_catalog") {
                    const resolvedStructuredCategory = resolveCategoryForPlaybook({
                        requestedCategory: structuredReplyIntent.category,
                        preferredDomain: restaurantPlaybook.vertical,
                        availability: restaurantPlaybook.availableCategories,
                        hasPrincipal: cartSnapshotMeta.hasPrincipal,
                        hasAdditional: cartSnapshotMeta.hasAdditional,
                        hasDrink: cartSnapshotMeta.hasDrink,
                    });
                    const shouldPromoteKanbanToAssembly =
                        resolvedStructuredCategory === "principal" &&
                        !cartSnapshotMeta.hasItems &&
                        /novo lead/i.test(String(kanbanStatus || "")) &&
                        /roleta/i.test(String(kanbanStatus || ""));

                    if (shouldPromoteKanbanToAssembly) {
                        const stageMoveRaw = await executeAiTool(
                            "move_kanban_stage",
                            { stage_name: "Montando Pedido" },
                            ctx
                        );
                        try {
                            const stageMoveResult = asRecord(JSON.parse(stageMoveRaw));
                            markToolCompleted(turnMetrics, {
                                toolName: "move_kanban_stage",
                                blocked: false,
                                skipped: stageMoveResult?.skipped === true,
                                ok: stageMoveResult?.ok === true,
                            });
                        } catch {
                            // ignore metric parse issue
                        }
                    }

                    const shouldSkipAutoCatalogForNeutralInbound =
                        resolvedStructuredCategory === "principal" &&
                        !cartSnapshotMeta.hasItems &&
                        inboundIsNeutralWithoutCatalogIntent;

                    if (shouldSkipAutoCatalogForNeutralInbound) {
                        logAiEvent("structured_reply_payload_skipped", {
                            chatId: params.chatId,
                            iteration,
                            toolName: "send_uaz_carousel",
                            reason: "NEUTRAL_INBOUND_NO_CATALOG_INTENT",
                            autoTriggeredBy: structuredReplyIntent.kind,
                            category: resolvedStructuredCategory,
                        });
                    } else {
                        const categorySearchRaw = await executeAiTool(
                            "search_product_catalog",
                            { category: resolvedStructuredCategory },
                            ctx
                        );

                        try {
                            const categorySearchResult = asRecord(JSON.parse(categorySearchRaw));
                            const categoryProducts = asProductList(categorySearchResult?.products);
                            const autoCategoryPitch = buildActiveCategoryPitch(
                                resolvedStructuredCategory,
                                cupomGanho
                            );

                            if (categoryProducts.length > 0) {
                                const autoCarouselRaw = await executeAiTool(
                                    "send_uaz_carousel",
                                    {
                                        products: categoryProducts,
                                        text: autoCategoryPitch,
                                    },
                                    ctx
                                );
                                const autoCarouselResult = asRecord(JSON.parse(autoCarouselRaw));
                                const autoCarouselPayload = asRecord(
                                    autoCarouselResult?.uazapi_payload
                                );

                                if (autoCarouselPayload) {
                                    const duplicatePayload = await wasOutgoingPayloadAlreadySent(
                                        supabase,
                                        params.chatId,
                                        autoCarouselPayload,
                                        ctx.trigger_message_created_at
                                    );

                                    if (!duplicatePayload) {
                                        const payloadSendResult = await sendRichPayload(
                                            autoCarouselPayload,
                                            instanceToken
                                        );
                                        if (wasOutboundDeliveryAccepted(payloadSendResult)) {
                                            logAiEvent("outbound_payload_sent", {
                                                chatId: params.chatId,
                                                iteration,
                                                toolName: "send_uaz_carousel",
                                                endpoint: payloadSendResult.endpoint || null,
                                                status: payloadSendResult.status || null,
                                                delivered: true,
                                                autoTriggeredBy: structuredReplyIntent.kind,
                                                category: resolvedStructuredCategory,
                                            });
                                            markPayloadSent(turnMetrics);
                                            await persistOutgoingMessage(
                                                supabase,
                                                params,
                                                typeof autoCarouselPayload.text === "string"
                                                    ? autoCarouselPayload.text
                                                    : autoCategoryPitch,
                                                autoCarouselPayload
                                            );
                                            loopActive = false;
                                            break;
                                        }

                                        logAiEvent("outbound_payload_failed", {
                                            chatId: params.chatId,
                                            iteration,
                                            toolName: "send_uaz_carousel",
                                            endpoint: payloadSendResult.endpoint || null,
                                            status: payloadSendResult.status || null,
                                            error: payloadSendResult.error || null,
                                            autoTriggeredBy: structuredReplyIntent.kind,
                                            category: resolvedStructuredCategory,
                                        });
                                        markPayloadFailed(turnMetrics);
                                    } else {
                                        logAiEvent("structured_reply_payload_skipped", {
                                            chatId: params.chatId,
                                            iteration,
                                            toolName: "send_uaz_carousel",
                                            reason: "DUPLICATE_PAYLOAD_IN_CURRENT_TURN",
                                            autoTriggeredBy: structuredReplyIntent.kind,
                                            category: resolvedStructuredCategory,
                                        });
                                    }
                                }
                            }
                        } catch {
                            // keep the text fallback below if the synthetic catalog step fails
                        }
                    }
                } else if (structuredReplyIntent) {
                    const autoToolName =
                        structuredReplyIntent.kind === "request_location"
                            ? "request_user_location"
                            : "send_uaz_buttons";
                    const autoToolArgs =
                        structuredReplyIntent.kind === "request_location"
                            ? {}
                            : {
                                text: "Como prefere pagar?",
                                choices: ["PIX", "Dinheiro", "Cartao"],
                                footerText: "Escolha uma opcao",
                            };
                    const autoToolRaw = await executeAiTool(autoToolName, autoToolArgs, ctx);

                    try {
                        const autoToolResult = asRecord(JSON.parse(autoToolRaw));
                        const autoPayload = asRecord(autoToolResult?.uazapi_payload);
                        if (autoPayload) {
                            const duplicatePayload = await wasOutgoingPayloadAlreadySent(
                                supabase,
                                params.chatId,
                                autoPayload,
                                ctx.trigger_message_created_at
                            );

                            if (!duplicatePayload) {
                                const payloadSendResult = await sendRichPayload(autoPayload, instanceToken);
                                if (wasOutboundDeliveryAccepted(payloadSendResult)) {
                                    logAiEvent("outbound_payload_sent", {
                                        chatId: params.chatId,
                                        iteration,
                                        toolName: autoToolName,
                                        endpoint: payloadSendResult.endpoint || null,
                                        status: payloadSendResult.status || null,
                                        delivered: true,
                                        autoTriggeredBy: structuredReplyIntent.kind,
                                    });
                                    markPayloadSent(turnMetrics);
                                    await persistOutgoingMessage(
                                        supabase,
                                        params,
                                        typeof autoPayload.text === "string"
                                            ? autoPayload.text
                                            : `[${autoToolName}]`,
                                        autoPayload
                                    );
                                    loopActive = false;
                                    break;
                                }

                                logAiEvent("outbound_payload_failed", {
                                    chatId: params.chatId,
                                    iteration,
                                    toolName: autoToolName,
                                    endpoint: payloadSendResult.endpoint || null,
                                    status: payloadSendResult.status || null,
                                    error: payloadSendResult.error || null,
                                    autoTriggeredBy: structuredReplyIntent.kind,
                                });
                                markPayloadFailed(turnMetrics);
                            } else {
                                logAiEvent("structured_reply_payload_skipped", {
                                    chatId: params.chatId,
                                    iteration,
                                    toolName: autoToolName,
                                    reason: "DUPLICATE_PAYLOAD_IN_CURRENT_TURN",
                                    autoTriggeredBy: structuredReplyIntent.kind,
                                });
                            }
                        }
                    } catch {
                        // keep the text fallback below if the synthetic tool step fails
                    }
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
                    markTextFailed(turnMetrics);
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
                markTextSent(turnMetrics);
                await persistOutgoingMessage(supabase, params, safeOutboundText);
                loopActive = false;
                break;
            }

            if (!emptyResponseRetried) {
                emptyResponseRetried = true;
                console.warn("[AI LOOP] Empty response, retrying once.");
                logAiEvent("empty_response_retry", {
                    chatId: params.chatId,
                    iteration,
                });
                conversationContext.push({
                    role: "user",
                    parts: [{
                        text: "Responda ao cliente agora com a proxima acao objetiva, sem ficar em silencio.",
                    }],
                });
                continue;
            }

            const emptyResponseFallbackText =
                "Opa, estou confirmando aqui. Me responde com um ok que eu sigo com a proxima etapa.";
            const emptyFallbackSendResult = await sendTextMessage(
                params.waChatId,
                emptyResponseFallbackText,
                instanceToken
            );

            if (wasOutboundDeliveryAccepted(emptyFallbackSendResult)) {
                logAiEvent("outbound_text_sent", {
                    chatId: params.chatId,
                    iteration,
                    endpoint: emptyFallbackSendResult.endpoint || "/send/text",
                    status: emptyFallbackSendResult.status || null,
                    textLength: emptyResponseFallbackText.length,
                    autoTriggeredBy: "empty_response_fallback",
                });
                markTextSent(turnMetrics);
                await persistOutgoingMessage(supabase, params, emptyResponseFallbackText);
            } else {
                logAiEvent("outbound_text_failed", {
                    chatId: params.chatId,
                    iteration,
                    endpoint: emptyFallbackSendResult.endpoint || "/send/text",
                    status: emptyFallbackSendResult.status || null,
                    error: emptyFallbackSendResult.error || null,
                    autoTriggeredBy: "empty_response_fallback",
                });
                markTextFailed(turnMetrics);
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
        markProcessFailure(turnMetrics, getErrorMessage(error));
        logAiEvent("process_failed", {
            chatId: params.chatId,
            error: getErrorMessage(error),
        });
    } finally {
        const turnSummary = buildAiTurnSummary(turnMetrics, {
            maxIterationsReached: loopActive && iteration >= MAX_ITERATIONS,
        });
        const metricsPersisted = await persistAiTurnMetrics(supabase, params, turnSummary);
        logAiEvent("process_completed", {
            chatId: params.chatId,
            metricsPersisted,
            ...turnSummary,
        });
    }
}
