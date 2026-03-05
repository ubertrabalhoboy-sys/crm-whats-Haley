/**
 * Gemini Client Module
 *
 * Handles Gemini model creation, caching, and history sanitization.
 */

import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import {
    GEMINI_MODEL_NAME,
    GEMINI_TOOLS,
    MODEL_CACHE,
    MODEL_CACHE_LIMIT,
} from "./orchestrator-types";
import { logAiEvent } from "./orchestrator-utils";

// ---------------------------------------------------------------------------
// Model Cache
// ---------------------------------------------------------------------------

export function getOrCreateGeminiModel(
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
