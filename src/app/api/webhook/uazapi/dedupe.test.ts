import { afterEach, describe, expect, it, vi } from "vitest";

const checkRateLimitMock = vi.fn();
const redisSetMock = vi.fn();
const processAiMessageMock = vi.fn();

function createSupabaseMock() {
    return {
        from: vi.fn((table: string) => {
            if (table === "restaurants") {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn((column: string, value: unknown) => ({
                            maybeSingle: vi.fn().mockResolvedValue(
                                column === "uaz_instance_name" && value === "inst-test"
                                    ? { data: { id: "rest-1" }, error: null }
                                    : { data: null, error: null }
                            ),
                        })),
                    })),
                    update: vi.fn(() => ({
                        eq: vi.fn().mockResolvedValue({ error: null }),
                    })),
                };
            }

            if (table === "contacts") {
                const secondEq = {
                    maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: "contact-1" },
                        error: null,
                    }),
                };
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => secondEq),
                        })),
                    })),
                    insert: vi.fn(() => ({
                        select: vi.fn(() => ({
                            single: vi.fn().mockResolvedValue({
                                data: { id: "contact-1" },
                                error: null,
                            }),
                        })),
                    })),
                };
            }

            if (table === "chats") {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                maybeSingle: vi.fn().mockResolvedValue({
                                    data: {
                                        id: "chat-1",
                                        last_message: "msg",
                                        stage_id: "stage-1",
                                        kanban_status: "Novo Lead (Roleta)",
                                    },
                                    error: null,
                                }),
                            })),
                        })),
                    })),
                    update: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn().mockResolvedValue({ error: null }),
                        })),
                    })),
                    insert: vi.fn(() => ({
                        select: vi.fn(() => ({
                            single: vi.fn().mockResolvedValue({
                                data: { id: "chat-1" },
                                error: null,
                            }),
                        })),
                    })),
                };
            }

            if (table === "messages") {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                        })),
                    })),
                    insert: vi.fn().mockResolvedValue({ error: null }),
                    update: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn().mockResolvedValue({ error: null }),
                        })),
                    })),
                };
            }

            if (table === "kanban_stages") {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                order: vi.fn(() => ({
                                    limit: vi.fn(() => ({
                                        maybeSingle: vi.fn().mockResolvedValue({
                                            data: { id: "stage-1", name: "Novo Lead (Roleta)" },
                                            error: null,
                                        }),
                                    })),
                                })),
                                maybeSingle: vi.fn().mockResolvedValue({
                                    data: { id: "stage-1", name: "Novo Lead (Roleta)" },
                                    error: null,
                                }),
                            })),
                            order: vi.fn(() => ({
                                limit: vi.fn(() => ({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: { id: "stage-1", name: "Novo Lead (Roleta)" },
                                        error: null,
                                    }),
                                })),
                            })),
                        })),
                    })),
                };
            }

            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                    })),
                })),
                insert: vi.fn().mockResolvedValue({ error: null }),
                update: vi.fn(() => ({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                })),
            };
        }),
    };
}

vi.mock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => createSupabaseMock()),
}));

vi.mock("@/lib/shared/rate-limit", () => ({
    checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
    rateLimitRedis: {
        set: (...args: unknown[]) => redisSetMock(...args),
    },
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
    processAiMessage: (...args: unknown[]) => processAiMessageMock(...args),
}));

describe("Webhook dedupe lock", () => {
    afterEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.unstubAllEnvs();
    });

    it("returns deduped when Redis lock already exists for waMessageId", async () => {
        vi.stubEnv("WEBHOOK_SECRET_TOKEN", "dummy-webhook-secret");
        checkRateLimitMock.mockResolvedValue({ success: true, limit: 15, remaining: 14 });
        redisSetMock.mockResolvedValue(null);

        const { POST } = await import("./route");
        const req = new Request("http://localhost/api/webhook/uazapi", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-webhook-secret": "dummy-webhook-secret",
            },
            body: JSON.stringify({
                event: "message",
                instanceName: "inst-test",
                message: {
                    id: "wamid-1",
                    chatId: "5531990000000@s.whatsapp.net",
                    from: "5531990000000",
                    text: "Oi",
                },
            }),
        });

        const response = await POST(req);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({ ok: true, deduped: true });
        expect(redisSetMock).toHaveBeenCalledWith("msg_lock:wamid-1", "1", {
            nx: true,
            ex: 15,
        });
        expect(processAiMessageMock).not.toHaveBeenCalled();
    });
});

