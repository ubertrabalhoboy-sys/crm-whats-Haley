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

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export const GEMINI_API_KEY = requireEnv("GEMINI_API_KEY");
export const OPENAI_API_KEY = optionalEnv("OPENAI_API_KEY");

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
