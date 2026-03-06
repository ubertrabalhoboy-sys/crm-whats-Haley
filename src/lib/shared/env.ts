/**
 * Centralized Environment Variable Validation
 *
 * All required env vars are validated once at first import.
 * Consumers import typed constants instead of using `process.env.X!`.
 *
 * WHY: eliminates scattered non-null assertions (`!`) that crash
 * without a clear message when a variable is missing.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value || value.trim() === "") {
        throw new Error(
            `[env] Missing required environment variable: ${name}. ` +
            `Add it to .env.local or your hosting environment.`
        );
    }
    return value.trim();
}

function optionalEnv(name: string, fallback: string = ""): string {
    const value = process.env[name];
    return value && value.trim() !== "" ? value.trim() : fallback;
}

function parseBooleanEnv(value: string, fallback: boolean) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
        return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
        return false;
    }
    return fallback;
}

function parseNumberEnv(value: string, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

export const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON_KEY = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// ---------------------------------------------------------------------------
// Uazapi (WhatsApp API)
// ---------------------------------------------------------------------------

export const UAZAPI_BASE_URL = requireEnv("UAZAPI_BASE_URL");
export const UAZAPI_GLOBAL_API_KEY = requireEnv("UAZAPI_GLOBAL_API_KEY");
export const UAZAPI_ADMIN_TOKEN = optionalEnv("UAZAPI_ADMIN_TOKEN");
export const UAZAPI_TOKEN = optionalEnv("UAZAPI_TOKEN");

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export const GEMINI_API_KEY = requireEnv("GEMINI_API_KEY");
export const OPENAI_API_KEY = optionalEnv("OPENAI_API_KEY");
export const GEMINI_TRIAGE_MODEL_NAME = optionalEnv(
    "GEMINI_TRIAGE_MODEL_NAME",
    "gemini-2.5-flash-lite"
);

// ---------------------------------------------------------------------------
// External Services
// ---------------------------------------------------------------------------

export const GOOGLE_MAPS_API_KEY = optionalEnv("GOOGLE_MAPS_API_KEY");
export const FIQON_WEBHOOK_URL = optionalEnv("FIQON_WEBHOOK_URL");

// ---------------------------------------------------------------------------
// App Config
// ---------------------------------------------------------------------------

export const APP_URL = optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
export const PUBLIC_BASE_URL = optionalEnv("PUBLIC_BASE_URL");
export const AI_PREFIX_CACHE_MODE = optionalEnv("AI_PREFIX_CACHE_MODE", "off");
export const AI_GOOGLE_CONTEXT_CACHE_ENABLED = parseBooleanEnv(
    optionalEnv("AI_GOOGLE_CONTEXT_CACHE_ENABLED", "false"),
    false
);
export const AI_GOOGLE_CONTEXT_CACHE_TTL_SECONDS = Math.max(
    60,
    Math.floor(parseNumberEnv(optionalEnv("AI_GOOGLE_CONTEXT_CACHE_TTL_SECONDS", "3600"), 3600))
);
export const AI_MODEL_ROUTING_ENABLED = parseBooleanEnv(
    optionalEnv("AI_MODEL_ROUTING_ENABLED", "true"),
    true
);
export const AI_MODEL_ROUTING_SHORT_TEXT_THRESHOLD = Math.max(
    5,
    Math.floor(parseNumberEnv(optionalEnv("AI_MODEL_ROUTING_SHORT_TEXT_THRESHOLD", "28"), 28))
);
export const AI_SUMMARY_BUFFER_ENABLED = parseBooleanEnv(
    optionalEnv("AI_SUMMARY_BUFFER_ENABLED", "true"),
    true
);
export const AI_SUMMARY_BUFFER_RECENT_MESSAGES = Math.max(
    4,
    Math.floor(parseNumberEnv(optionalEnv("AI_SUMMARY_BUFFER_RECENT_MESSAGES", "8"), 8))
);
export const AI_RESTAURANT_PLAYBOOK_OVERRIDES_JSON = optionalEnv(
    "AI_RESTAURANT_PLAYBOOK_OVERRIDES_JSON"
);
export const AI_RETENTION_COUPON_ENABLED = parseBooleanEnv(
    optionalEnv("AI_RETENTION_COUPON_ENABLED", "false"),
    false
);
export const AI_RETENTION_COUPON_CODE = optionalEnv(
    "AI_RETENTION_COUPON_CODE",
    "RETENCAO10"
);
export const AI_WEBHOOK_QUEUE_ENABLED = parseBooleanEnv(
    optionalEnv("AI_WEBHOOK_QUEUE_ENABLED", "false"),
    false
);
export const AI_WEBHOOK_QUEUE_BATCH_SIZE = Number.parseInt(
    optionalEnv("AI_WEBHOOK_QUEUE_BATCH_SIZE", "20"),
    10
) || 20;
export const AI_CHAT_TURN_BUDGET_24H = Number.parseInt(
    optionalEnv("AI_CHAT_TURN_BUDGET_24H", "50"),
    10
) || 50;
export const AI_CHAT_TOKEN_BUDGET_24H = Number.parseInt(
    optionalEnv("AI_CHAT_TOKEN_BUDGET_24H", "250000"),
    10
) || 250000;
export const AI_CHAT_BUDGET_POLICY = optionalEnv(
    "AI_CHAT_BUDGET_POLICY",
    "human_handoff"
);
export const AI_AUDIO_MAX_SECONDS = Math.max(
    10,
    Math.floor(parseNumberEnv(optionalEnv("AI_AUDIO_MAX_SECONDS", "30"), 30))
);
export const AI_COST_USD_TO_BRL = parseNumberEnv(
    optionalEnv("AI_COST_USD_TO_BRL", "5.0"),
    5.0
);
export const AI_FRIDAY_LOYAL_CRON_ENABLED = parseBooleanEnv(
    optionalEnv("AI_FRIDAY_LOYAL_CRON_ENABLED", "false"),
    false
);
export const AI_FRIDAY_LOYAL_ONLY_FRIDAY = parseBooleanEnv(
    optionalEnv("AI_FRIDAY_LOYAL_ONLY_FRIDAY", "true"),
    true
);
export const AI_FRIDAY_LOYAL_DRY_RUN = parseBooleanEnv(
    optionalEnv("AI_FRIDAY_LOYAL_DRY_RUN", "false"),
    false
);
export const AI_FRIDAY_LOYAL_MIN_ORDERS = Math.max(
    1,
    Math.floor(parseNumberEnv(optionalEnv("AI_FRIDAY_LOYAL_MIN_ORDERS", "2"), 2))
);
export const AI_FRIDAY_LOYAL_WINDOW_DAYS = Math.max(
    7,
    Math.floor(parseNumberEnv(optionalEnv("AI_FRIDAY_LOYAL_WINDOW_DAYS", "30"), 30))
);
export const AI_FRIDAY_LOYAL_MAX_PER_RESTAURANT = Math.max(
    1,
    Math.floor(parseNumberEnv(optionalEnv("AI_FRIDAY_LOYAL_MAX_PER_RESTAURANT", "50"), 50))
);
export const AI_FRIDAY_LOYAL_MAX_RESTAURANTS = Math.max(
    1,
    Math.floor(parseNumberEnv(optionalEnv("AI_FRIDAY_LOYAL_MAX_RESTAURANTS", "100"), 100))
);
export const CRON_SECRET = optionalEnv("CRON_SECRET");

// ---------------------------------------------------------------------------
// Security — Webhook Authentication
// ---------------------------------------------------------------------------

/** Secret token that Uazapi must send in x-webhook-secret header. */
export const WEBHOOK_SECRET_TOKEN = optionalEnv("WEBHOOK_SECRET_TOKEN");
export const WEBHOOK_SECRET_REQUIRED = parseBooleanEnv(
    optionalEnv("WEBHOOK_SECRET_REQUIRED", process.env.NODE_ENV === "production" ? "true" : "false"),
    process.env.NODE_ENV === "production"
);

// ---------------------------------------------------------------------------
// Rate Limit (Upstash Redis)
// ---------------------------------------------------------------------------

export const UPSTASH_REDIS_REST_URL = optionalEnv("UPSTASH_REDIS_REST_URL");
export const UPSTASH_REDIS_REST_TOKEN = optionalEnv("UPSTASH_REDIS_REST_TOKEN");
