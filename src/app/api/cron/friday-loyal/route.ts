import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    AI_FRIDAY_LOYAL_CRON_ENABLED,
    AI_FRIDAY_LOYAL_DRY_RUN,
    AI_FRIDAY_LOYAL_MAX_PER_RESTAURANT,
    AI_FRIDAY_LOYAL_MAX_RESTAURANTS,
    AI_FRIDAY_LOYAL_MIN_ORDERS,
    AI_FRIDAY_LOYAL_ONLY_FRIDAY,
    AI_FRIDAY_LOYAL_WINDOW_DAYS,
    CRON_SECRET,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
    UAZAPI_BASE_URL,
    UAZAPI_GLOBAL_API_KEY,
} from "@/lib/shared/env";

export const dynamic = "force-dynamic";

type RestaurantRow = {
    id: string;
    name: string | null;
    uaz_instance_token: string | null;
    uaz_instance_name: string | null;
};

type CampaignScheduleRow = {
    restaurant_id: string;
    campaign_key: string;
    enabled: boolean;
    weekdays: number[] | null;
    hour_local: number | null;
    timezone: string | null;
};

type FridayLoyalRow = {
    restaurant_id: string;
    chat_id: string;
    wa_chat_id: string | null;
    friday_order_count: number | null;
    last_order_at: string | null;
    last_item_name: string | null;
};

type PriorityProductRow = {
    id: string;
    nome: string | null;
    is_available?: boolean | null;
    stock_quantity?: number | null;
    estoque?: number | null;
    expiration_date?: string | null;
};

type RunStatus = "success" | "failed" | "skipped";

function createSupabaseAdminClient() {
    return createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );
}

function normalizeBaseUrl(url: string) {
    return url.replace(/\/$/, "");
}

function parseJsonSafe(text: string) {
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

function extractErrorMessage(value: unknown) {
    if (!value || typeof value !== "object") return null;
    const obj = value as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message.trim();
    if (typeof obj.error === "string" && obj.error.trim()) return obj.error.trim();
    return null;
}

function isInvalidTokenFailure(status: number, responseBody: unknown) {
    if (status === 401) return true;
    const message = String(extractErrorMessage(responseBody) || "").toLowerCase();
    return message.includes("invalid token") || message.includes("token invalido");
}

function isMethodOrRouteMismatch(status: number) {
    return status === 404 || status === 405;
}

type CampaignSendResult = {
    ok: boolean;
    status: number;
    endpoint: string;
    body: unknown;
};

async function sendFridayCampaignMessage(params: {
    baseUrl: string;
    globalApiKey: string;
    instanceToken: string;
    instanceName: string | null;
    number: string;
    text: string;
}): Promise<CampaignSendResult> {
    const baseUrl = normalizeBaseUrl(params.baseUrl);
    const headersV1: Record<string, string> = {
        "Content-Type": "application/json",
        token: params.instanceToken,
    };
    if (params.globalApiKey) {
        headersV1.apikey = params.globalApiKey;
    }

    const firstResponse = await fetch(`${baseUrl}/send/text`, {
        method: "POST",
        headers: headersV1,
        body: JSON.stringify({
            number: params.number,
            text: params.text,
        }),
        cache: "no-store",
    });
    const firstRaw = await firstResponse.text();
    const firstBody = parseJsonSafe(firstRaw) ?? firstRaw;

    if (firstResponse.ok) {
        return {
            ok: true,
            status: firstResponse.status,
            endpoint: "/send/text",
            body: firstBody,
        };
    }

    const canFallback =
        (isInvalidTokenFailure(firstResponse.status, firstBody) ||
            isMethodOrRouteMismatch(firstResponse.status)) &&
        Boolean(params.globalApiKey);

    if (!canFallback) {
        return {
            ok: false,
            status: firstResponse.status || 502,
            endpoint: "/send/text",
            body: firstBody,
        };
    }

    const fallbackEndpoints = ["/messages/send", "/v1/messages/send"];
    let lastFailure: CampaignSendResult = {
        ok: false,
        status: firstResponse.status || 502,
        endpoint: "/send/text",
        body: firstBody,
    };

    for (const fallbackEndpoint of fallbackEndpoints) {
        const normalizedEndpoint =
            baseUrl.endsWith("/v1") && fallbackEndpoint.startsWith("/v1/")
                ? fallbackEndpoint.replace(/^\/v1/, "")
                : fallbackEndpoint;

        const fallbackResponse = await fetch(`${baseUrl}${normalizedEndpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${params.globalApiKey}`,
                "Instance-Token": params.instanceToken,
            },
            body: JSON.stringify({
                number: params.number,
                textMessage: { text: params.text },
                instanceName: params.instanceName || undefined,
            }),
            cache: "no-store",
        });

        const fallbackRaw = await fallbackResponse.text();
        const fallbackBody = parseJsonSafe(fallbackRaw) ?? fallbackRaw;

        if (fallbackResponse.ok) {
            return {
                ok: true,
                status: fallbackResponse.status,
                endpoint: normalizedEndpoint,
                body: fallbackBody,
            };
        }

        lastFailure = {
            ok: false,
            status: fallbackResponse.status || 502,
            endpoint: normalizedEndpoint,
            body: fallbackBody,
        };

        if (!isMethodOrRouteMismatch(fallbackResponse.status)) {
            break;
        }
    }

    return lastFailure;
}

function parseBooleanQuery(value: string | null, fallback: boolean) {
    if (value == null) return fallback;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return fallback;
}

function resolveWeekdayInTimezone(now: Date, timezone: string) {
    const weekday = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: timezone,
    }).format(now).toLowerCase();

    const map: Record<string, number> = {
        sun: 0,
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
    };
    return map[weekday] ?? null;
}

function resolveHourInTimezone(now: Date, timezone: string) {
    const hour = new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hour12: false,
        timeZone: timezone,
    }).format(now);
    const parsed = Number(hour);
    return Number.isFinite(parsed) ? parsed : null;
}

function isFridayInSaoPaulo(now: Date) {
    const weekday = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: "America/Sao_Paulo",
    }).format(now);
    return weekday.toLowerCase() === "fri";
}

function getSaoPauloDateKey(now: Date) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
}

function cleanNumberFromWaChatId(waChatId: string | null) {
    if (!waChatId) return "";
    return waChatId.split("@")[0]?.replace(/\D/g, "") || "";
}

function readStockNumber(row: PriorityProductRow) {
    const candidates = [row.stock_quantity, row.estoque];
    for (const candidate of candidates) {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
    }
    return null;
}

function isProductAvailable(row: PriorityProductRow) {
    if (typeof row.is_available === "boolean" && row.is_available === false) {
        return false;
    }
    const stock = readStockNumber(row);
    if (stock !== null) return stock > 0;
    return true;
}

function readExpirationTimestamp(row: PriorityProductRow) {
    if (typeof row.expiration_date !== "string" || !row.expiration_date.trim()) {
        return null;
    }
    const parsed = Date.parse(row.expiration_date);
    return Number.isFinite(parsed) ? parsed : null;
}

async function findPrioritySuggestion(
    supabase: ReturnType<typeof createSupabaseAdminClient>,
    restaurantId: string
) {
    const selectCandidates = [
        "id, nome, is_available, stock_quantity, estoque, expiration_date",
        "id, nome, is_available, stock_quantity, estoque",
        "id, nome, is_available, estoque",
        "id, nome, stock_quantity, estoque",
        "id, nome",
    ];

    for (const selectClause of selectCandidates) {
        const { data, error } = await supabase
            .from("produtos_promo")
            .select(selectClause)
            .eq("restaurant_id", restaurantId)
            .eq("is_priority", true)
            .limit(25);

        if (error) {
            continue;
        }

        const typed = ((data || []) as unknown) as PriorityProductRow[];
        const available = typed.filter(isProductAvailable);
        if (available.length === 0) {
            return null;
        }

        available.sort((a, b) => {
            const aExp = readExpirationTimestamp(a);
            const bExp = readExpirationTimestamp(b);
            if (aExp !== null && bExp !== null && aExp !== bExp) {
                return aExp - bExp;
            }
            if (aExp !== null && bExp === null) return -1;
            if (aExp === null && bExp !== null) return 1;
            const aStock = readStockNumber(a) ?? -1;
            const bStock = readStockNumber(b) ?? -1;
            return bStock - aStock;
        });

        const top = available[0];
        return typeof top?.nome === "string" && top.nome.trim()
            ? top.nome.trim()
            : null;
    }

    return null;
}

async function hasExistingCampaignRun(params: {
    supabase: ReturnType<typeof createSupabaseAdminClient>;
    restaurantId: string;
    chatId: string;
    fingerprint: string;
}) {
    const { data, error } = await params.supabase
        .from("automation_runs")
        .select("id")
        .eq("restaurant_id", params.restaurantId)
        .eq("chat_id", params.chatId)
        .eq("trigger", "friday_loyal_campaign")
        .eq("fingerprint", params.fingerprint)
        .in("status", ["queued", "running", "success"])
        .limit(1);

    if (error) {
        return { ok: false, error: error.message, exists: false } as const;
    }

    return { ok: true, exists: (data || []).length > 0 } as const;
}

async function recordCampaignRun(params: {
    supabase: ReturnType<typeof createSupabaseAdminClient>;
    restaurantId: string;
    chatId: string;
    fingerprint: string;
    status: RunStatus;
    error: string | null;
    context: Record<string, unknown>;
}) {
    const { error } = await params.supabase.from("automation_runs").insert({
        restaurant_id: params.restaurantId,
        automation_id: null,
        chat_id: params.chatId,
        trigger: "friday_loyal_campaign",
        fingerprint: params.fingerprint,
        status: params.status,
        error: params.error,
        context: params.context,
        created_at: new Date().toISOString(),
        executed_at: new Date().toISOString(),
    });

    if (error) {
        console.warn("[FRIDAY LOYAL] failed to write automation_runs", {
            restaurantId: params.restaurantId,
            chatId: params.chatId,
            error: error.message,
        });
    }
}

function buildFridayCampaignText(params: {
    restaurantName: string;
    lastItemName: string | null;
    priorityItemName: string | null;
}) {
    const lines = [
        `Opa! Sextou no ${params.restaurantName}.`,
    ];

    if (params.lastItemName) {
        lines.push(`Quer repetir seu pedido de ${params.lastItemName}?`);
    } else {
        lines.push("Quer que eu te mostre os mais pedidos de hoje?");
    }

    if (params.priorityItemName) {
        lines.push(`Hoje estamos com destaque em ${params.priorityItemName}.`);
    }

    lines.push("Se quiser, eu ja abro seu pedido por aqui.");
    return lines.join(" ");
}

function shouldRunRestaurantBySchedule(params: {
    now: Date;
    schedule: CampaignScheduleRow;
}) {
    const timezone = typeof params.schedule.timezone === "string" && params.schedule.timezone.trim()
        ? params.schedule.timezone.trim()
        : "America/Sao_Paulo";
    const weekdays = Array.isArray(params.schedule.weekdays)
        ? params.schedule.weekdays
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
        : [];
    const hourLocal = Number(params.schedule.hour_local);

    if (!weekdays.length || !Number.isInteger(hourLocal) || hourLocal < 0 || hourLocal > 23) {
        return { run: false, reason: "SCHEDULE_INVALID" as const };
    }

    const nowWeekday = resolveWeekdayInTimezone(params.now, timezone);
    const nowHour = resolveHourInTimezone(params.now, timezone);
    if (nowWeekday === null || nowHour === null) {
        return { run: false, reason: "SCHEDULE_TIME_RESOLVE_FAILED" as const };
    }

    if (!weekdays.includes(nowWeekday)) {
        return { run: false, reason: "SCHEDULE_DAY_MISMATCH" as const };
    }

    if (nowHour !== hourLocal) {
        return { run: false, reason: "SCHEDULE_HOUR_MISMATCH" as const };
    }

    return { run: true as const, reason: null };
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    if (!AI_FRIDAY_LOYAL_CRON_ENABLED) {
        return NextResponse.json({
            ok: true,
            skipped: true,
            reason: "FEATURE_DISABLED",
        });
    }

    const now = new Date();
    const forceRun = parseBooleanQuery(req.nextUrl.searchParams.get("force"), false);
    const dryRun = parseBooleanQuery(
        req.nextUrl.searchParams.get("dry_run"),
        AI_FRIDAY_LOYAL_DRY_RUN
    );

    const supabase = createSupabaseAdminClient();
    const { data: restaurants, error: restaurantsError } = await supabase
        .from("restaurants")
        .select("id, name, uaz_instance_token, uaz_instance_name")
        .not("uaz_instance_token", "is", null)
        .limit(AI_FRIDAY_LOYAL_MAX_RESTAURANTS);

    if (restaurantsError) {
        return NextResponse.json(
            { ok: false, error: restaurantsError.message },
            { status: 500 }
        );
    }

    const campaignDateKey = getSaoPauloDateKey(now);
    const baseUrl = normalizeBaseUrl(UAZAPI_BASE_URL || "");
    const globalApiKey = UAZAPI_GLOBAL_API_KEY || "";
    const typedRestaurants = ((restaurants || []) as unknown) as RestaurantRow[];
    const restaurantIds = typedRestaurants.map((restaurant) => restaurant.id);
    const scheduleByRestaurant = new Map<string, CampaignScheduleRow>();

    if (restaurantIds.length > 0) {
        const { data: scheduleRows, error: scheduleError } = await supabase
            .from("restaurant_campaign_schedules")
            .select("restaurant_id, campaign_key, enabled, weekdays, hour_local, timezone")
            .eq("campaign_key", "friday_loyal")
            .eq("enabled", true)
            .in("restaurant_id", restaurantIds);

        const scheduleTableMissing =
            String(scheduleError?.code || "") === "42P01" ||
            String(scheduleError?.message || "").toLowerCase().includes("restaurant_campaign_schedules");

        if (scheduleError && !scheduleTableMissing) {
            return NextResponse.json(
                { ok: false, error: scheduleError.message },
                { status: 500 }
            );
        }

        if (!scheduleError && Array.isArray(scheduleRows)) {
            const typedScheduleRows = (scheduleRows as unknown) as CampaignScheduleRow[];
            for (const row of typedScheduleRows) {
                if (typeof row.restaurant_id === "string" && row.restaurant_id.trim()) {
                    scheduleByRestaurant.set(row.restaurant_id, row);
                }
            }
        }
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const perRestaurant: Array<Record<string, unknown>> = [];

    for (const restaurant of typedRestaurants) {
        const token = typeof restaurant.uaz_instance_token === "string"
            ? restaurant.uaz_instance_token.trim()
            : "";
        if (!token) {
            continue;
        }

        const configuredSchedule = scheduleByRestaurant.get(restaurant.id) || null;
        const useLegacyFridayGuard = !configuredSchedule;
        if (!forceRun && configuredSchedule) {
            const scheduleDecision = shouldRunRestaurantBySchedule({
                now,
                schedule: configuredSchedule,
            });
            if (!scheduleDecision.run) {
                perRestaurant.push({
                    restaurant_id: restaurant.id,
                    restaurant_name: restaurant.name || "Restaurante",
                    sent: 0,
                    failed: 0,
                    skipped: 1,
                    reason: scheduleDecision.reason,
                });
                skipped += 1;
                continue;
            }
        }

        if (
            !forceRun &&
            useLegacyFridayGuard &&
            AI_FRIDAY_LOYAL_ONLY_FRIDAY &&
            !isFridayInSaoPaulo(now)
        ) {
            perRestaurant.push({
                restaurant_id: restaurant.id,
                restaurant_name: restaurant.name || "Restaurante",
                sent: 0,
                failed: 0,
                skipped: 1,
                reason: "NOT_FRIDAY_IN_SAO_PAULO",
            });
            skipped += 1;
            continue;
        }

        const { data: loyalTargets, error: targetsError } = await supabase.rpc(
            "get_friday_loyal_customers",
            {
                p_restaurant_id: restaurant.id,
                p_min_orders: AI_FRIDAY_LOYAL_MIN_ORDERS,
                p_window_days: AI_FRIDAY_LOYAL_WINDOW_DAYS,
            }
        );

        if (targetsError) {
            perRestaurant.push({
                restaurant_id: restaurant.id,
                restaurant_name: restaurant.name || "Restaurante",
                sent: 0,
                failed: 0,
                skipped: 0,
                error: targetsError.message,
            });
            continue;
        }

        const typedTargets = (((loyalTargets || []) as unknown) as FridayLoyalRow[])
            .slice(0, AI_FRIDAY_LOYAL_MAX_PER_RESTAURANT);
        const prioritySuggestion = await findPrioritySuggestion(supabase, restaurant.id);

        let restaurantSent = 0;
        let restaurantFailed = 0;
        let restaurantSkipped = 0;
        let restaurantLastError: string | null = null;

        for (const target of typedTargets) {
            const chatId = typeof target.chat_id === "string" ? target.chat_id : "";
            const waChatId = typeof target.wa_chat_id === "string" ? target.wa_chat_id : "";
            if (!chatId || !waChatId) {
                restaurantSkipped += 1;
                skipped += 1;
                continue;
            }

            const fingerprint = `friday_loyal_campaign:${restaurant.id}:${chatId}:${campaignDateKey}`;
            const existingRun = await hasExistingCampaignRun({
                supabase,
                restaurantId: restaurant.id,
                chatId,
                fingerprint,
            });

            if (!existingRun.ok) {
                await recordCampaignRun({
                    supabase,
                    restaurantId: restaurant.id,
                    chatId,
                    fingerprint,
                    status: "failed",
                    error: existingRun.error,
                    context: {
                        source: "cron_friday_loyal",
                        dry_run: dryRun,
                    },
                });
                restaurantFailed += 1;
                failed += 1;
                continue;
            }

            if (existingRun.exists) {
                restaurantSkipped += 1;
                skipped += 1;
                continue;
            }

            const messageText = buildFridayCampaignText({
                restaurantName: restaurant.name?.trim() || "Restaurante",
                lastItemName:
                    typeof target.last_item_name === "string" && target.last_item_name.trim()
                        ? target.last_item_name.trim()
                        : null,
                priorityItemName: prioritySuggestion,
            });

            if (dryRun) {
                await recordCampaignRun({
                    supabase,
                    restaurantId: restaurant.id,
                    chatId,
                    fingerprint,
                    status: "skipped",
                    error: "DRY_RUN",
                    context: {
                        source: "cron_friday_loyal",
                        dry_run: true,
                        preview_message: messageText,
                        friday_order_count: target.friday_order_count,
                        last_item_name: target.last_item_name,
                        priority_suggestion: prioritySuggestion,
                    },
                });
                restaurantSkipped += 1;
                skipped += 1;
                continue;
            }

            const number = cleanNumberFromWaChatId(waChatId);
            if (!number) {
                await recordCampaignRun({
                    supabase,
                    restaurantId: restaurant.id,
                    chatId,
                    fingerprint,
                    status: "failed",
                    error: "MISSING_WA_NUMBER",
                    context: {
                        source: "cron_friday_loyal",
                        dry_run: false,
                    },
                });
                restaurantFailed += 1;
                failed += 1;
                continue;
            }

            try {
                const sendResult = await sendFridayCampaignMessage({
                    baseUrl,
                    globalApiKey,
                    instanceToken: token,
                    instanceName:
                        typeof restaurant.uaz_instance_name === "string"
                            ? restaurant.uaz_instance_name
                            : null,
                    number,
                    text: messageText,
                });

                if (!sendResult.ok) {
                    const responseErrorPayload =
                        typeof sendResult.body === "string"
                            ? sendResult.body
                            : JSON.stringify(sendResult.body);
                    const responseError =
                        responseErrorPayload || `UAZ_SEND_FAILED:${sendResult.status}`;
                    restaurantLastError = responseError;
                    await recordCampaignRun({
                        supabase,
                        restaurantId: restaurant.id,
                        chatId,
                        fingerprint,
                        status: "failed",
                        error: responseError,
                        context: {
                            source: "cron_friday_loyal",
                            dry_run: false,
                            endpoint: sendResult.endpoint,
                            status: sendResult.status,
                        },
                    });
                    restaurantFailed += 1;
                    failed += 1;
                    continue;
                }

                await supabase.from("messages").insert({
                    chat_id: chatId,
                    restaurant_id: restaurant.id,
                    direction: "out",
                    text: messageText,
                    payload: {
                        source: "friday_loyal_campaign",
                        priority_suggestion: prioritySuggestion,
                    },
                });

                await supabase
                    .from("chats")
                    .update({
                        last_message: messageText,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", chatId)
                    .eq("restaurant_id", restaurant.id);

                await recordCampaignRun({
                    supabase,
                    restaurantId: restaurant.id,
                    chatId,
                    fingerprint,
                    status: "success",
                    error: null,
                    context: {
                        source: "cron_friday_loyal",
                        dry_run: false,
                        friday_order_count: target.friday_order_count,
                        last_item_name: target.last_item_name,
                        priority_suggestion: prioritySuggestion,
                    },
                });

                restaurantSent += 1;
                sent += 1;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                await recordCampaignRun({
                    supabase,
                    restaurantId: restaurant.id,
                    chatId,
                    fingerprint,
                    status: "failed",
                    error: errorMessage,
                    context: {
                        source: "cron_friday_loyal",
                        dry_run: false,
                    },
                });
                restaurantFailed += 1;
                failed += 1;
                restaurantLastError = errorMessage;
            }
        }

        perRestaurant.push({
            restaurant_id: restaurant.id,
            restaurant_name: restaurant.name || "Restaurante",
            candidates: typedTargets.length,
            sent: restaurantSent,
            failed: restaurantFailed,
            skipped: restaurantSkipped,
            priority_suggestion: prioritySuggestion,
            last_error: restaurantLastError,
            schedule_configured: Boolean(configuredSchedule),
            trigger_mode: configuredSchedule ? "scheduled" : "legacy",
        });
    }

    return NextResponse.json({
        ok: true,
        dry_run: dryRun,
        date_key: campaignDateKey,
        processed_restaurants: perRestaurant.length,
        sent,
        failed,
        skipped,
        per_restaurant: perRestaurant,
    });
}
