import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } from "./env";

/**
 * Distributed Rate Limiter
 * 
 * Uses Upstash Redis to provide consistent rate limiting across multiple
 * serverless function instances. If Redis credentials are not configured,
 * it falls back to allowing all requests (passthrough).
 */

const redis = (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN)
    ? new Redis({
        url: UPSTASH_REDIS_REST_URL,
        token: UPSTASH_REDIS_REST_TOKEN,
    })
    : null;

// Create a new ratelimiter that allows 15 requests per minute
export const webhookRateLimit = redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(15, "1m"),
        analytics: true,
        prefix: "ratelimit:webhook",
    })
    : null;

/**
 * Checks if a request should be rate limited.
 * 
 * @param identifier Unique ID for the requester (e.g. restaurantId or IP)
 * @returns Object with { success, limit, remaining, reset }
 */
export async function checkRateLimit(identifier: string) {
    if (!webhookRateLimit) {
        // Fallback: if Redis is not configured, don't block anything
        return { success: true, limit: 15, remaining: 15, reset: 0 };
    }

    try {
        return await webhookRateLimit.limit(identifier);
    } catch (error) {
        console.error("[rate-limit] Upstash error, falling back to allow:", error);
        return { success: true, limit: 15, remaining: 15, reset: 0 };
    }
}
