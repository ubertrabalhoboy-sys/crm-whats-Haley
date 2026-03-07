/**
 * Gemini Client Module
 *
 * Handles Gemini model creation, caching, and history sanitization.
 */

import {
    GoogleGenerativeAI,
    Content,
    CachedContent,
} from "@google/generative-ai";
import { GoogleAICacheManager } from "@google/generative-ai/server";
import {
    GEMINI_TOOLS,
    MODEL_CACHE,
    MODEL_CACHE_LIMIT,
} from "./orchestrator-types";
import { logAiEvent } from "./orchestrator-utils";

// ---------------------------------------------------------------------------
// Model Cache
// ---------------------------------------------------------------------------

const REMOTE_CONTEXT_CACHE = new Map<
    string,
    { expiresAt: number; cachedContent: CachedContent }
>();
const GOOGLE_CACHE_MANAGER_BY_KEY = new Map<string, GoogleAICacheManager>();

function hashKey(input: string) {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash +=
            (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(36);
}

function getCacheManager(apiKey: string) {
    const cached = GOOGLE_CACHE_MANAGER_BY_KEY.get(apiKey);
    if (cached) return cached;
    const manager = new GoogleAICacheManager(apiKey);
    GOOGLE_CACHE_MANAGER_BY_KEY.set(apiKey, manager);
    return manager;
}

async function getOrCreateGoogleContextCache(params: {
    apiKey: string;
    cacheKey: string;
    modelName: string;
    systemInstruction: string;
    ttlSeconds: number;
}) {
    const now = Date.now();
    const cached = REMOTE_CONTEXT_CACHE.get(params.cacheKey);
    if (cached && cached.expiresAt > now) {
        logAiEvent("google_context_cache_hit", {
            cacheKey: params.cacheKey,
            cacheName: cached.cachedContent.name || null,
        });
        return cached.cachedContent;
    }

    const manager = getCacheManager(params.apiKey);
    const displayName = `haley-${hashKey(params.cacheKey)}`.slice(0, 40);

    try {
        const created = await manager.create({
            model: params.modelName,
            systemInstruction: params.systemInstruction,
            tools: [{ functionDeclarations: GEMINI_TOOLS }],
            contents: [
                {
                    role: "user",
                    parts: [{ text: "context cache seed" }],
                },
            ],
            ttlSeconds: params.ttlSeconds,
            displayName,
        });

        REMOTE_CONTEXT_CACHE.set(params.cacheKey, {
            expiresAt: now + params.ttlSeconds * 1000,
            cachedContent: created,
        });
        logAiEvent("google_context_cache_miss", {
            cacheKey: params.cacheKey,
            cacheName: created.name || null,
            ttlSeconds: params.ttlSeconds,
        });
        return created;
    } catch (error: unknown) {
        logAiEvent("google_context_cache_failed", {
            cacheKey: params.cacheKey,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

export async function getOrCreateGeminiModel(
    genAI: GoogleGenerativeAI,
    params: {
        modelName: string;
        systemInstruction: string;
        cacheKey: string;
        usePrefixModelCache: boolean;
        googleContextCacheEnabled: boolean;
        googleContextCacheTtlSeconds: number;
        googleContextCacheApiKey: string;
    }
) {
    if (!params.usePrefixModelCache) {
        logAiEvent("prefix_model_cache_bypass", {
            cacheKey: params.cacheKey,
            model: params.modelName,
        });
        return genAI.getGenerativeModel({
            model: params.modelName,
            systemInstruction: params.systemInstruction,
            tools: [{ functionDeclarations: GEMINI_TOOLS }],
        });
    }

    const cachedModel = MODEL_CACHE.get(params.cacheKey);
    if (cachedModel) {
        logAiEvent("prefix_model_cache_hit", {
            cacheKey: params.cacheKey,
            cacheSize: MODEL_CACHE.size,
            model: params.modelName,
        });
        return cachedModel;
    }

    let model = null as ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null;

    if (params.googleContextCacheEnabled) {
        const cachedContent = await getOrCreateGoogleContextCache({
            apiKey: params.googleContextCacheApiKey,
            cacheKey: params.cacheKey,
            modelName: params.modelName,
            systemInstruction: params.systemInstruction,
            ttlSeconds: params.googleContextCacheTtlSeconds,
        });
        if (cachedContent) {
            try {
                model = genAI.getGenerativeModelFromCachedContent(cachedContent, {
                    tools: [{ functionDeclarations: GEMINI_TOOLS }],
                });
            } catch (error: unknown) {
                logAiEvent("google_context_cache_bind_failed", {
                    cacheKey: params.cacheKey,
                    model: params.modelName,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    if (!model) {
        model = genAI.getGenerativeModel({
            model: params.modelName,
            systemInstruction: params.systemInstruction,
            tools: [{ functionDeclarations: GEMINI_TOOLS }],
        });
    }

    if (MODEL_CACHE.size >= MODEL_CACHE_LIMIT) {
        const oldestKey = MODEL_CACHE.keys().next().value;
        if (oldestKey) {
            MODEL_CACHE.delete(oldestKey);
        }
    }

    MODEL_CACHE.set(params.cacheKey, model);
    logAiEvent("prefix_model_cache_miss", {
        cacheKey: params.cacheKey,
        cacheSize: MODEL_CACHE.size,
        model: params.modelName,
    });
    return model;
}

// ---------------------------------------------------------------------------
// History Sanitization
// ---------------------------------------------------------------------------

export function sanitizeGeminiHistory(history: Content[]): Content[] {
    const sanitized: Content[] = [];

    for (const msg of history) {
        if (sanitized.length === 0) {
            sanitized.push({ role: msg.role, parts: [...msg.parts] });
            continue;
        }

        const lastSanitized = sanitized[sanitized.length - 1];

        // Se o papel mudou, apenas adicionamos
        if (msg.role !== lastSanitized.role) {
            sanitized.push({ role: msg.role, parts: [...msg.parts] });
        } else {
            // Se o papel é o mesmo, tentamos mesclar as partes de texto, 
            // mas preservamos as partes que não são de texto (ex: audio)
            lastSanitized.parts.push(...msg.parts);
        }
    }

    return sanitized;
}

// ---------------------------------------------------------------------------
// Content Helpers
// ---------------------------------------------------------------------------

export function getContentText(content: Content | undefined) {
    if (!content?.parts?.length) return "";

    return content.parts
        .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
}
