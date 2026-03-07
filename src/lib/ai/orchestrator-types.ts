/**
 * Orchestrator Types & Constants
 *
 * All shared type definitions and module-level constants used
 * across the orchestrator subsystem.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { mapOpenAIToolsToGemini } from "./geminiMapper";
import openaiTools from "./tools.json";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export type OpenAIToolDefinition = {
    type: string;
    function: {
        name: string;
        description: string;
        parameters?: Record<string, unknown>;
    };
};

export type StoredMessage = {
    direction: string;
    text: string | null;
    payload: unknown;
    created_at?: string | null;
};

export type KanbanStageRelation = { name?: string | null };

export type ChatContextRecord = {
    stage_id?: string | null;
    kanban_status?: string | null;
    cupom_ganho?: string | null;
    last_activity_at?: string | null;
    cart_snapshot?: unknown;
    kanban_stages?: KanbanStageRelation | KanbanStageRelation[] | null;
};

export type PixPayload = {
    number?: string;
    amount?: number;
    text?: string;
    pixKey?: string;
    pixType?: string;
};

export type PrefixCacheMode = "off" | "shadow" | "enabled";

export type OutboundSendResult = {
    ok: boolean;
    delivered: boolean;
    status?: number;
    body?: unknown;
    error?: string;
    endpoint?: string;
};

export type OrchestratorParams = {
    restaurantId: string;
    chatId: string;
    waChatId: string;
    instanceName?: string;
    incomingText: string;
    mediaBase64?: string | null;
    mediaMimeType?: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GEMINI_TOOLS = mapOpenAIToolsToGemini(openaiTools as OpenAIToolDefinition[]);
export const GEMINI_MODEL_NAME = "gemini-2.5-flash"; // Modelo padrão do usuário (Custo-benefício)
export const MODEL_CACHE_LIMIT = 32;
export const MODEL_CACHE = new Map<string, ReturnType<GoogleGenerativeAI["getGenerativeModel"]>>();
export const GEMINI_REQUEST_TIMEOUT_MS = 20000;
export const UAZAPI_REQUEST_TIMEOUT_MS = 10000;
export const UAZAPI_CAROUSEL_TIMEOUT_MS = 30000;
export const UAZAPI_CAROUSEL_RETRY_TIMEOUT_MS = 45000;
export const ENABLED_MODE_RECENT_CONTEXT_LIMIT = 8;
