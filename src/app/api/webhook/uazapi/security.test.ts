import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => ({
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    single: vi.fn().mockResolvedValue({ data: null, error: null }),
                    order: vi.fn(() => ({
                        limit: vi.fn(() => ({
                            maybeSingle: vi.fn().mockResolvedValue({
                                data: { id: "stage-1", name: "Inicio" },
                                error: null,
                            }),
                        })),
                    })),
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
            })),
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
            })),
        })),
    })),
}));

vi.mock("@/lib/shared/rate-limit", () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 15, remaining: 14 }),
}));

vi.mock("@/lib/uazapi/triggers", () => ({
    extractButtonClicked: vi.fn(() => null),
}));

vi.mock("@/lib/automations/engine", () => ({
    runAutomations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/fiqon-webhook", () => ({
    triggerFiqonWebhook: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ai/orchestrator", () => ({
    processAiMessage: vi.fn().mockResolvedValue(undefined),
}));

describe("Webhook security hardening", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
        vi.clearAllMocks();
    });

    it("returns 503 when WEBHOOK_SECRET_REQUIRED=true and secret is missing", async () => {
        vi.stubEnv("WEBHOOK_SECRET_REQUIRED", "true");
        vi.stubEnv("WEBHOOK_SECRET_TOKEN", "");

        const { POST } = await import("./route");
        const req = new Request("http://localhost/api/webhook/uazapi", {
            method: "POST",
            body: JSON.stringify({ event: "message" }),
            headers: { "content-type": "application/json" },
        });

        const res = await POST(req);
        const payload = await res.json();

        expect(res.status).toBe(503);
        expect(payload).toEqual({
            ok: false,
            error: "WEBHOOK_SECRET_NOT_CONFIGURED",
        });
    });
});
