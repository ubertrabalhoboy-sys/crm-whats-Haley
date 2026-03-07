import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { WEBHOOK_SECRET_TOKEN } from "@/lib/shared/env";

// Mock das dependências externas
vi.mock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => ({
        from: vi.fn(() => ({
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    order: vi.fn(() => ({
                        limit: vi.fn(() => ({
                            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "1", name: "Início" }, error: null })
                        }))
                    }))
                }))
            }))
        }))
    }))
}));

vi.mock("@/lib/shared/rate-limit", () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 15, remaining: 14, reset: 0 })
}));

describe("Webhook Uazapi Integration", () => {
    const baseUrl = "http://localhost/api/webhook/uazapi";

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should allow request when WEBHOOK_SECRET_REQUIRED is false and secret is missing", async () => {
        // Forçamos o mock do secret se ele não estiver no .env do ambiente de teste
        // Mas no nosso setup.ts ele já é 'dummy-key'

        const req = new Request(baseUrl, {
            method: "POST",
            body: JSON.stringify({ event: "message", text: "Oi" }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);
    });

    it("should allow request when WEBHOOK_SECRET_REQUIRED is false and secret is incorrect", async () => {
        const req = new Request(`${baseUrl}?secret=wrong-key`, {
            method: "POST",
            body: JSON.stringify({ event: "message", text: "Oi" }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
    });

    it("should allow request when secret is provided in query params", async () => {
        // Usamos o valor do mock definido no setup.ts ou env.ts
        const secret = WEBHOOK_SECRET_TOKEN || "dummy-key";

        const req = new Request(`${baseUrl}?secret=${secret}`, {
            method: "POST",
            body: JSON.stringify({
                event: "message",
                instanceName: "test-instance",
                chat: { wa_chatid: "123", phone: "5511999999999" },
                message: { text: "Teste" }
            }),
        });

        const res = await POST(req);
        // Esperamos 200 porque o tenant_unresolved retorna 200 ok:true no seu código atual
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);
    });

    it("should allow request when secret is provided in x-webhook-secret header", async () => {
        const secret = WEBHOOK_SECRET_TOKEN || "dummy-key";

        const req = new Request(baseUrl, {
            method: "POST",
            headers: {
                "x-webhook-secret": secret,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                event: "message",
                instanceName: "test-instance",
                chat: { wa_chatid: "123", phone: "5511999999999" },
                message: { text: "Teste" }
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
    });

    it("should return 400 for invalid JSON", async () => {
        const secret = WEBHOOK_SECRET_TOKEN || "dummy-key";

        const req = new Request(`${baseUrl}?secret=${secret}`, {
            method: "POST",
            body: "invalid-json-body",
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
    });
});
