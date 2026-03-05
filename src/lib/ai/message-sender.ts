/**
 * Message Sender Module
 *
 * Handles outbound message delivery (text + rich payloads) via Uazapi,
 * message persistence, and incoming text normalization.
 */

import {
    buildButtonFallbackRequests,
    resolveUazapiRequest,
    validateOutgoingPayload,
} from "./uazapiRules";
import type { OrchestratorParams, OutboundSendResult } from "./orchestrator-types";
import {
    UAZAPI_REQUEST_TIMEOUT_MS,
    UAZAPI_CAROUSEL_TIMEOUT_MS,
    UAZAPI_CAROUSEL_RETRY_TIMEOUT_MS,
} from "./orchestrator-types";
import {
    fetchWithTimeout,
    getErrorMessage,
    getSupabaseAdmin,
    normalizeBaseUrl,
    parseApiResponseBody,
} from "./orchestrator-utils";
import { UAZAPI_BASE_URL, UAZAPI_GLOBAL_API_KEY } from "../shared/env";

function buildUazapiHeaders(instanceToken: string) {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        token: instanceToken,
    };
    const globalApiKey = String(UAZAPI_GLOBAL_API_KEY || "").trim();
    if (globalApiKey) {
        headers.apikey = globalApiKey;
    }
    return headers;
}

// ---------------------------------------------------------------------------
// Incoming Text Normalization
// ---------------------------------------------------------------------------

export async function normalizeIncomingText(
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

    const productSelectionMatch = raw.match(
        /^(?:add|buy|comprar|escolher|selecionar)\s+(.+)$/i
    );

    if (productSelectionMatch) {
        const selectedProductText = productSelectionMatch[1].trim();
        if (selectedProductText) {
            const { data: selectedProduct } = await supabase
                .from("produtos_promo")
                .select("id, nome, category")
                .eq("restaurant_id", params.restaurantId)
                .ilike("nome", `%${selectedProductText}%`)
                .limit(1)
                .maybeSingle();

            if (selectedProduct?.id) {
                const productName =
                    typeof selectedProduct.nome === "string"
                        ? selectedProduct.nome
                        : selectedProductText;
                const productCategory =
                    typeof selectedProduct.category === "string"
                        ? selectedProduct.category
                        : "principal";
                return `CLIENT_ACTION:add_to_cart product_id=${selectedProduct.id} product_name="${productName}" category=${productCategory}`;
            }
        }
    }

    return raw;
}

// ---------------------------------------------------------------------------
// Send Text Message
// ---------------------------------------------------------------------------

export async function sendTextMessage(number: string, text: string, instanceToken: string) {
    const base = UAZAPI_BASE_URL;
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
                headers: buildUazapiHeaders(instanceToken),
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

// ---------------------------------------------------------------------------
// Delivery Check
// ---------------------------------------------------------------------------

export function wasOutboundDeliveryAccepted(result: OutboundSendResult | null | undefined) {
    return Boolean(result?.delivered);
}

// ---------------------------------------------------------------------------
// Send Rich Payload
// ---------------------------------------------------------------------------

export async function sendRichPayload(uazapiPayload: Record<string, unknown>, instanceToken: string) {
    const base = UAZAPI_BASE_URL;
    if (!base || !instanceToken) {
        return {
            ok: false,
            delivered: false,
            error: "UAZAPI_NOT_CONFIGURED",
        } satisfies OutboundSendResult;
    }

    const request = resolveUazapiRequest(uazapiPayload);
    const { endpoint, payload } = request;

    const payloadValidation = validateOutgoingPayload(endpoint, payload);
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

    const sendRequest = async (
        targetEndpoint: string,
        targetPayload: Record<string, unknown>,
        timeoutMs: number
    ): Promise<OutboundSendResult> => {
        try {
            const res = await fetchWithTimeout(
                `${normalizeBaseUrl(base)}${targetEndpoint}`,
                {
                    method: "POST",
                    headers: buildUazapiHeaders(instanceToken),
                    body: JSON.stringify(targetPayload),
                },
                timeoutMs
            );

            const raw = await res.text();
            return {
                ok: res.ok,
                delivered: res.ok,
                status: res.status,
                body: parseApiResponseBody(raw),
                endpoint: targetEndpoint,
            } satisfies OutboundSendResult;
        } catch (error: unknown) {
            return {
                ok: false,
                delivered: false,
                error: getErrorMessage(error) || "UAZAPI_RICH_SEND_FAILED",
                endpoint: targetEndpoint,
            } satisfies OutboundSendResult;
        }
    };

    const primaryTimeoutMs =
        endpoint === "/send/carousel" ? UAZAPI_CAROUSEL_TIMEOUT_MS : UAZAPI_REQUEST_TIMEOUT_MS;
    let result = await sendRequest(endpoint, payload, primaryTimeoutMs);

    const errorMessage = String(result.error || "").toLowerCase();
    const isAbortFailure = errorMessage.includes("aborterror") || errorMessage.includes("aborted");

    if (endpoint === "/send/carousel" && !result.delivered && isAbortFailure) {
        result = await sendRequest(endpoint, payload, UAZAPI_CAROUSEL_RETRY_TIMEOUT_MS);
    }

    const isButtonEndpoint = endpoint === "/send/button";
    const currentRequestKey = `${endpoint}:${JSON.stringify(payload)}`;

    if (isButtonEndpoint && (result.status === 405 || result.status === 404)) {
        for (const fallbackRequest of buildButtonFallbackRequests(uazapiPayload)) {
            const fallbackRequestKey = `${fallbackRequest.endpoint}:${JSON.stringify(fallbackRequest.payload)}`;
            if (fallbackRequestKey === currentRequestKey) continue;

            const fallbackValidation = validateOutgoingPayload(
                fallbackRequest.endpoint,
                fallbackRequest.payload
            );
            if (!fallbackValidation.ok) continue;

            const fallbackResult = await sendRequest(
                fallbackRequest.endpoint,
                fallbackRequest.payload,
                UAZAPI_REQUEST_TIMEOUT_MS
            );

            if (
                fallbackResult.delivered ||
                (fallbackResult.status !== 405 && fallbackResult.status !== 404)
            ) {
                result = fallbackResult;
                break;
            }
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Persist Outgoing Message
// ---------------------------------------------------------------------------

export async function persistOutgoingMessage(
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
