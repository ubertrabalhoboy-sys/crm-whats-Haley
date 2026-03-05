/**
 * Shared Utility Functions
 *
 * Functions that were duplicated across orchestrator.ts and toolHandler.ts
 * are consolidated here. Both modules now import from this single source.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./env";

// ---------------------------------------------------------------------------
// Supabase Admin Client (single factory)
// ---------------------------------------------------------------------------

let _adminClient: SupabaseClient | null = null;

/**
 * Returns a Supabase client with SERVICE_ROLE privileges.
 * Uses a singleton to avoid creating multiple clients.
 */
export function getSupabaseAdmin(): SupabaseClient {
    if (!_adminClient) {
        _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
        });
    }
    return _adminClient;
}

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

/**
 * Safely extract an error message from an unknown thrown value.
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

// ---------------------------------------------------------------------------
// Fetch with Timeout
// ---------------------------------------------------------------------------

/**
 * Wraps `fetch` with an AbortController-based timeout.
 * Throws if the request takes longer than `timeoutMs`.
 */
export async function fetchWithTimeout(
    input: string,
    init: RequestInit,
    timeoutMs: number
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------------
// Generic Timeout Wrapper
// ---------------------------------------------------------------------------

/**
 * Races a promise against a timeout. Rejects with `timeoutMessage`
 * if the promise doesn't resolve within `timeoutMs`.
 */
export function withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(timeoutMessage)),
            timeoutMs
        );
        operation
            .then((result) => {
                clearTimeout(timer);
                resolve(result);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}
