/**
 * Orchestrator Utility Functions
 *
 * Pure helper functions extracted from orchestrator.ts:
 * - Supabase admin client factory
 * - URL normalization, API response parsing
 * - Error handling, logging, timeout wrappers
 * - Record/payload introspection (asRecord, asPixPayload, fingerprinting)
 * - Kanban stage reading, product list parsing
 * - Cart persistence from CLIENT_ACTION
 * - Prompt building & prefix cache context
 */

import { Content } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import {
    AI_PREFIX_CACHE_MODE,
    AI_RESTAURANT_PLAYBOOK_OVERRIDES_JSON,
    APP_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
} from "../shared/env";
import { parseAddToCartClientAction } from "./orchestratorRules";
import { persistChatCartSnapshot } from "./toolHandlerData";
import { appendItemToCartSnapshot } from "./toolRules";
import type {
    ChatContextRecord,
    OrchestratorParams,
    PixPayload,
    PrefixCacheMode,
    StoredMessage,
} from "./orchestrator-types";
import { GEMINI_MODEL_NAME } from "./orchestrator-types";

type RestaurantVertical = "burger" | "acai" | "pizza" | "sushi" | "generic";
type RestaurantPlaybook = {
    vertical: RestaurantVertical;
    availableCategories: {
        principal: boolean;
        adicional: boolean;
        bebida: boolean;
    };
};
type RestaurantPlaybookOverride = {
    vertical?: RestaurantVertical;
    availableCategories?: Partial<RestaurantPlaybook["availableCategories"]>;
};

const PLAYBOOK_CACHE_TTL_MS = 5 * 60 * 1000;
const RESTAURANT_PLAYBOOK_CACHE = new Map<
    string,
    { expiresAt: number; playbook: RestaurantPlaybook }
>();
let PLAYBOOK_OVERRIDE_TABLE_MODE: "unknown" | "enabled" | "unavailable" = "unknown";
let AI_CHAT_MEMORY_TABLE_MODE: "unknown" | "enabled" | "unavailable" = "unknown";

// ---------------------------------------------------------------------------
// Supabase Admin
// ---------------------------------------------------------------------------

export function getSupabaseAdmin() {
    return createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );
}

// ---------------------------------------------------------------------------
// URL / Parsing
// ---------------------------------------------------------------------------

export function normalizeBaseUrl(url: string) {
    return url.replace(/\/$/, "");
}

export function parseApiResponseBody(raw: string) {
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

// ---------------------------------------------------------------------------
// Error / Logging / Timeout
// ---------------------------------------------------------------------------

export function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export function logAiEvent(event: string, details: Record<string, unknown> = {}) {
    console.log("[AI OBS]", {
        event,
        at: new Date().toISOString(),
        ...details,
    });
}

export async function withTimeout<T>(
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

export async function fetchWithTimeout(
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

// ---------------------------------------------------------------------------
// Record / Payload Introspection
// ---------------------------------------------------------------------------

export function asRecord(value: unknown) {
    if (typeof value === "object" && value !== null) {
        return value as Record<string, unknown>;
    }
    return null;
}

export function readKanbanStageName(value: ChatContextRecord["kanban_stages"]) {
    if (Array.isArray(value)) {
        const firstStage = value[0];
        return typeof firstStage?.name === "string" ? firstStage.name : null;
    }
    return typeof value?.name === "string" ? value.name : null;
}

export function asPixPayload(value: unknown): PixPayload | null {
    const record = asRecord(value);
    if (!record) return null;
    if (!("pixKey" in record) || !("amount" in record)) return null;

    return {
        number: typeof record.number === "string" ? record.number : undefined,
        amount: typeof record.amount === "number" ? record.amount : Number(record.amount),
        text: typeof record.text === "string" ? record.text : undefined,
        pixKey: typeof record.pixKey === "string" ? record.pixKey : undefined,
        pixType: typeof record.pixType === "string" ? record.pixType : undefined,
    };
}

export function buildPixPayloadFingerprint(payload: PixPayload) {
    return [
        payload.number || "",
        Number.isFinite(Number(payload.amount)) ? Number(payload.amount).toFixed(2) : "",
        payload.text || "",
        payload.pixKey || "",
        payload.pixType || "",
    ].join("|");
}

export function buildStablePayloadFingerprint(value: unknown): string | null {
    if (Array.isArray(value)) {
        const items = value
            .map((item) => buildStablePayloadFingerprint(item))
            .filter((item): item is string => item !== null);
        return `[${items.join(",")}]`;
    }

    if (typeof value === "object" && value !== null) {
        const record = value as Record<string, unknown>;
        const entries = Object.keys(record)
            .sort()
            .map((key) => {
                const serializedValue = buildStablePayloadFingerprint(record[key]);
                return serializedValue === null
                    ? `${JSON.stringify(key)}:null`
                    : `${JSON.stringify(key)}:${serializedValue}`;
            });
        return `{${entries.join(",")}}`;
    }

    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
    if (typeof value === "boolean") return value ? "true" : "false";
    if (value === null) return "null";
    return null;
}

// ---------------------------------------------------------------------------
// Deduplication Checks
// ---------------------------------------------------------------------------

export async function wasPixPayloadAlreadySent(
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
        if (!existingPayload) return false;
        return buildPixPayloadFingerprint(existingPayload) === targetFingerprint;
    });
}

export async function wasOutgoingPayloadAlreadySent(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    chatId: string,
    payload: Record<string, unknown>,
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
    const targetFingerprint = buildStablePayloadFingerprint(payload);
    if (!targetFingerprint) return false;

    return ((recentOutboundMessages || []) as Array<{ payload: unknown }>).some((message) => {
        const existingPayload = asRecord(message.payload);
        if (!existingPayload) return false;
        return buildStablePayloadFingerprint(existingPayload) === targetFingerprint;
    });
}

// ---------------------------------------------------------------------------
// Config Helpers
// ---------------------------------------------------------------------------

export function getPrefixCacheMode(): PrefixCacheMode {
    const rawMode = String(AI_PREFIX_CACHE_MODE || "off").toLowerCase();
    if (rawMode === "enabled" || rawMode === "shadow") return rawMode;
    return "off";
}

export function sanitizeStoredSystemPrompt(rawPrompt: string) {
    const promptBlockMatch = rawPrompt.match(/\$prompt\$([\s\S]*?)\$prompt\$/i);
    if (promptBlockMatch?.[1]) {
        const extractedPrompt = promptBlockMatch[1].trim();
        if (extractedPrompt) {
            return {
                prompt: extractedPrompt,
                sanitized: true,
                reason: "SQL_WRAPPER_DETECTED",
            } as const;
        }
    }

    return {
        prompt: rawPrompt,
        sanitized: false,
        reason: null,
    } as const;
}

// ---------------------------------------------------------------------------
// Product Parsing
// ---------------------------------------------------------------------------

export function asProductList(
    value: unknown
): Array<{
    product_id: string;
    title?: string;
    description?: string;
    image_url?: string;
    price?: number;
    promo_price?: number | null;
}> {
    if (!Array.isArray(value)) return [];

    return value
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .map((item) => ({
            product_id: typeof item.product_id === "string" ? item.product_id : "",
            title: typeof item.title === "string" ? item.title : undefined,
            description: typeof item.description === "string" ? item.description : undefined,
            image_url: typeof item.image_url === "string" ? item.image_url : undefined,
            price: Number.isFinite(Number(item.price)) ? Number(item.price) : undefined,
            promo_price: Number.isFinite(Number(item.promo_price))
                ? Number(item.promo_price)
                : item.promo_price === null
                    ? null
                    : undefined,
        }))
        .filter((item) => item.product_id);
}

function detectRestaurantVerticalFromCatalog(productNames: string[]) {
    const score = {
        burger: 0,
        acai: 0,
        pizza: 0,
        sushi: 0,
    };

    for (const rawName of productNames) {
        const name = String(rawName || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");

        if (!name) continue;
        if (/(acai|creme|tigela)/.test(name)) score.acai += 2;
        if (/(pizza|calabresa|marguerita|quatro queijos|brotinho|gigante)/.test(name)) score.pizza += 2;
        if (/(sushi|temaki|uramaki|hossomaki|sashimi|nigiri|hot roll)/.test(name)) score.sushi += 2;
        if (/(burger|hamburg|x-|smash|lanche|bacon monster|cheese salada|cheddar|chicken crisp)/.test(name))
            score.burger += 2;
    }

    const entries = Object.entries(score) as Array<[RestaurantVertical, number]>;
    entries.sort((a, b) => b[1] - a[1]);
    const top = entries[0];
    const second = entries[1];

    if (!top || top[1] <= 0) {
        return "generic" as const;
    }

    if (second && top[1] <= second[1]) {
        return "generic" as const;
    }

    return top[0];
}

function normalizeRestaurantVertical(value: unknown): RestaurantVertical | null {
    const normalized = String(value || "").trim().toLowerCase();
    if (
        normalized === "burger" ||
        normalized === "acai" ||
        normalized === "pizza" ||
        normalized === "sushi" ||
        normalized === "generic"
    ) {
        return normalized;
    }
    return null;
}

function parseBooleanOverride(value: unknown) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
        if (value === 1) return true;
        if (value === 0) return false;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1") return true;
        if (normalized === "false" || normalized === "0") return false;
    }
    return null;
}

function parsePlaybookOverrideFromEnv(restaurantId: string) {
    const raw = String(AI_RESTAURANT_PLAYBOOK_OVERRIDES_JSON || "").trim();
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const entry = asRecord(parsed?.[restaurantId]);
        if (!entry) return null;

        const vertical = normalizeRestaurantVertical(entry.vertical);
        const categoriesRecord = asRecord(entry.categories) || asRecord(entry.available_categories);
        const allowPrincipal = parseBooleanOverride(categoriesRecord?.principal);
        const allowAdicional = parseBooleanOverride(categoriesRecord?.adicional);
        const allowBebida = parseBooleanOverride(categoriesRecord?.bebida);

        return {
            vertical: vertical || undefined,
            availableCategories: {
                ...(allowPrincipal === null ? {} : { principal: allowPrincipal }),
                ...(allowAdicional === null ? {} : { adicional: allowAdicional }),
                ...(allowBebida === null ? {} : { bebida: allowBebida }),
            },
        } satisfies RestaurantPlaybookOverride;
    } catch {
        return null;
    }
}

async function readPlaybookOverrideFromDatabase(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    restaurantId: string
) {
    if (PLAYBOOK_OVERRIDE_TABLE_MODE === "unavailable") {
        return null;
    }

    const { data, error } = await supabase
        .from("restaurant_ai_playbook_overrides")
        .select("fixed_vertical, allow_principal, allow_adicional, allow_bebida")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();

    if (error) {
        const message = String(error.message || "").toLowerCase();
        const code = String(error.code || "").toLowerCase();
        const missingOverrideTable =
            code === "42p01" ||
            (message.includes("restaurant_ai_playbook_overrides") &&
                (message.includes("does not exist") ||
                    message.includes("not found") ||
                    message.includes("could not find")));

        if (missingOverrideTable) {
            PLAYBOOK_OVERRIDE_TABLE_MODE = "unavailable";
        }
        return null;
    }

    if (!data) {
        PLAYBOOK_OVERRIDE_TABLE_MODE = "enabled";
        return null;
    }

    const overrideRecord = data as Record<string, unknown>;
    const vertical = normalizeRestaurantVertical(overrideRecord.fixed_vertical);
    const allowPrincipal = parseBooleanOverride(overrideRecord.allow_principal);
    const allowAdicional = parseBooleanOverride(overrideRecord.allow_adicional);
    const allowBebida = parseBooleanOverride(overrideRecord.allow_bebida);
    PLAYBOOK_OVERRIDE_TABLE_MODE = "enabled";

    return {
        vertical: vertical || undefined,
        availableCategories: {
            ...(allowPrincipal === null ? {} : { principal: allowPrincipal }),
            ...(allowAdicional === null ? {} : { adicional: allowAdicional }),
            ...(allowBebida === null ? {} : { bebida: allowBebida }),
        },
    } satisfies RestaurantPlaybookOverride;
}

function applyPlaybookOverride(
    base: RestaurantPlaybook,
    override: RestaurantPlaybookOverride | null | undefined
) {
    if (!override) {
        return base;
    }

    const next: RestaurantPlaybook = {
        vertical: override.vertical || base.vertical,
        availableCategories: {
            principal:
                typeof override.availableCategories?.principal === "boolean"
                    ? override.availableCategories.principal
                    : base.availableCategories.principal,
            adicional:
                typeof override.availableCategories?.adicional === "boolean"
                    ? override.availableCategories.adicional
                    : base.availableCategories.adicional,
            bebida:
                typeof override.availableCategories?.bebida === "boolean"
                    ? override.availableCategories.bebida
                    : base.availableCategories.bebida,
        },
    };

    // safety: keep at least principal enabled to avoid dead-end progression.
    if (
        !next.availableCategories.principal &&
        !next.availableCategories.adicional &&
        !next.availableCategories.bebida
    ) {
        return {
            ...next,
            availableCategories: {
                principal: true,
                adicional: false,
                bebida: false,
            },
        };
    }

    return next;
}

export async function getRestaurantSalesPlaybook(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    restaurantId: string
) {
    const cached = RESTAURANT_PLAYBOOK_CACHE.get(restaurantId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
        return cached.playbook;
    }

    const { data } = await supabase
        .from("produtos_promo")
        .select("nome, category")
        .eq("restaurant_id", restaurantId)
        .limit(500);

    const products = Array.isArray(data) ? data : [];
    const productNames = products
        .map((row) => (typeof row?.nome === "string" ? row.nome : ""))
        .filter(Boolean);
    const categories = products
        .map((row) =>
            typeof row?.category === "string" ? row.category.toLowerCase() : ""
        )
        .filter(Boolean);

    const playbook: RestaurantPlaybook = {
        vertical: detectRestaurantVerticalFromCatalog(productNames),
        availableCategories: {
            principal: categories.includes("principal"),
            adicional: categories.includes("adicional"),
            bebida: categories.includes("bebida"),
        },
    };
    const dbOverride = await readPlaybookOverrideFromDatabase(supabase, restaurantId);
    const envOverride = parsePlaybookOverrideFromEnv(restaurantId);
    const mergedPlaybook = applyPlaybookOverride(
        applyPlaybookOverride(playbook, dbOverride),
        envOverride
    );

    RESTAURANT_PLAYBOOK_CACHE.set(restaurantId, {
        expiresAt: now + PLAYBOOK_CACHE_TTL_MS,
        playbook: mergedPlaybook,
    });

    return mergedPlaybook;
}

// ---------------------------------------------------------------------------
// Cart Persistence (from CLIENT_ACTION)
// ---------------------------------------------------------------------------

export type ParsedAddToCartAction = ReturnType<typeof parseAddToCartClientAction>;

export async function persistCartSelectionFromAction(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    params: OrchestratorParams,
    currentSnapshot: unknown,
    action: NonNullable<ParsedAddToCartAction>
) {
    const nextSnapshot = appendItemToCartSnapshot({
        snapshot: asRecord(currentSnapshot) as Record<string, unknown> | null,
        item: {
            product_id: action.productId,
            quantity: 1,
            category: action.category,
        },
        updatedAt: new Date().toISOString(),
    });

    await persistChatCartSnapshot(
        {
            from(table: "chats") {
                return supabase.from(table);
            },
        },
        {
            restaurant_id: params.restaurantId,
            chat_id: params.chatId,
            wa_chat_id: params.waChatId,
            base_url: APP_URL,
        },
        nextSnapshot
    );

    return nextSnapshot;
}

// ---------------------------------------------------------------------------
// Prompt Building & Prefix Cache
// ---------------------------------------------------------------------------

export function buildPromptExecutionPlan(
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

export function withPrefixCacheContext(
    conversationContext: Content[],
    dynamicContextSuffix: string,
    prefixCacheMode: PrefixCacheMode
): Content[] {
    if (prefixCacheMode !== "enabled") return conversationContext;

    return [
        { role: "user", parts: [{ text: dynamicContextSuffix }] },
        ...conversationContext,
    ];
}

// ---------------------------------------------------------------------------
// Message History Helpers
// ---------------------------------------------------------------------------

export function extractLatestOperationalText(
    messages: StoredMessage[],
    matcher: (text: string) => boolean
) {
    for (const message of messages) {
        const text = typeof message.text === "string" ? message.text.trim() : "";
        if (!text) continue;
        if (text.toLowerCase().startsWith("client_action:location_shared ")) continue;
        if (matcher(text)) return text;
    }
    return "";
}

export function extractLatestGpsLocation(messages: StoredMessage[]) {
    for (const message of messages) {
        const text = typeof message.text === "string" ? message.text.trim() : "";
        if (text.toLowerCase().startsWith("client_action:location_shared ")) {
            return text.replace(/^client_action:location_shared\s+/i, "").trim();
        }
    }
    return "";
}

export function getCartItemsFromSnapshot(snapshot: unknown) {
    const record = asRecord(snapshot);
    const items = Array.isArray(record?.items) ? record.items : [];

    return items
        .map((item) => {
            const itemRecord = asRecord(item);
            const productId =
                typeof itemRecord?.product_id === "string" ? itemRecord.product_id : "";
            const quantity = Number(itemRecord?.quantity);

            if (!productId || !Number.isFinite(quantity) || quantity <= 0) return null;

            return { product_id: productId, quantity };
        })
        .filter(
            (item): item is { product_id: string; quantity: number } => item !== null
        );
}

// ---------------------------------------------------------------------------
// Turn Management
// ---------------------------------------------------------------------------

export async function wasTurnSupersededByNewInbound(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    chatId: string,
    triggerMessageCreatedAt?: string
) {
    if (!triggerMessageCreatedAt) return false;

    const { data, error } = await supabase
        .from("messages")
        .select("id")
        .eq("chat_id", chatId)
        .eq("direction", "in")
        .gt("created_at", triggerMessageCreatedAt)
        .limit(1);

    if (error) {
        console.warn("[AI LOOP] Failed to check stale turn state", {
            chatId,
            error: error.message,
        });
        return false;
    }

    return Boolean(data && data.length > 0);
}

export async function persistAiTurnMetrics(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    params: OrchestratorParams,
    summary: ReturnType<typeof import("./aiMetrics").buildAiTurnSummary>
) {
    const { buildAiTurnMetricInsert } = await import("./aiMetrics");
    const metricRow = buildAiTurnMetricInsert(
        {
            restaurantId: params.restaurantId,
            chatId: params.chatId,
            waChatId: params.waChatId,
        },
        summary
    );

    const { error } = await supabase.from("ai_turn_metrics").insert(metricRow);
    if (error) {
        console.error("[AI OBS] Failed to persist ai_turn_metrics:", error.message);
        return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Summary Buffer (Persistent Chat Memory)
// ---------------------------------------------------------------------------

type AiChatMemoryRow = {
    summary_text?: string | null;
    updated_at?: string | null;
} | null;

export async function readChatSummaryMemory(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    chatId: string
) {
    if (!chatId || AI_CHAT_MEMORY_TABLE_MODE === "unavailable") {
        return null;
    }

    const { data, error } = await supabase
        .from("ai_chat_memory")
        .select("summary_text, updated_at")
        .eq("chat_id", chatId)
        .maybeSingle();

    if (error) {
        const code = String((error as { code?: string }).code || "").toLowerCase();
        const message = String(error.message || "").toLowerCase();
        if (
            code === "42p01" ||
            (message.includes("ai_chat_memory") &&
                (message.includes("does not exist") || message.includes("not found")))
        ) {
            AI_CHAT_MEMORY_TABLE_MODE = "unavailable";
        }
        return null;
    }

    AI_CHAT_MEMORY_TABLE_MODE = "enabled";
    return (data as AiChatMemoryRow) || null;
}

export async function persistChatSummaryMemory(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    params: { restaurantId: string; chatId: string; waChatId: string },
    summaryText: string
) {
    if (!params.chatId || !summaryText.trim() || AI_CHAT_MEMORY_TABLE_MODE === "unavailable") {
        return false;
    }

    const { error } = await supabase
        .from("ai_chat_memory")
        .upsert(
            {
                restaurant_id: params.restaurantId,
                chat_id: params.chatId,
                wa_chat_id: params.waChatId,
                summary_text: summaryText.trim(),
                updated_at: new Date().toISOString(),
            },
            { onConflict: "chat_id" }
        );

    if (error) {
        const code = String((error as { code?: string }).code || "").toLowerCase();
        const message = String(error.message || "").toLowerCase();
        if (
            code === "42p01" ||
            (message.includes("ai_chat_memory") &&
                (message.includes("does not exist") || message.includes("not found")))
        ) {
            AI_CHAT_MEMORY_TABLE_MODE = "unavailable";
        }
        return false;
    }

    AI_CHAT_MEMORY_TABLE_MODE = "enabled";
    return true;
}
