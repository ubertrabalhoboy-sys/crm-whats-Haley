import { createClient, SupabaseClient } from "@supabase/supabase-js";

import {
    buildCarouselPriceText,
    buildCartSnapshotData,
    buildScheduledFollowupPayload,
    calculateCouponDiscount,
    resolveAppliedDiscount,
} from "./toolRules";
import {
    getActiveChatCouponCode,
    getChatFollowupState,
    persistChatCartSnapshot,
} from "./toolHandlerData";
import {
    GOOGLE_MAPS_API_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
} from "../shared/env";

export type ToolContext = {
    restaurant_id: string;
    wa_chat_id?: string;
    chat_id?: string;
    base_url: string;
    trigger_message_created_at?: string;
};

type OperatingHoursMap = Record<string, { open: string; close: string; isClosed: boolean }>;
type CatalogProductRow = {
    id: string;
    nome: string | null;
    description: string | null;
    preco_original: number | null;
    preco_promo: number | null;
    imagem_url: string | null;
};
type CartItem = {
    product_id?: string;
    quantity: number;
    category?: string;
};
type CartSnapshot = {
    items: CartItem[];
    subtotal: number;
    discount: number;
    delivery_fee: number;
    distance_km?: number;
    total: number;
    applied_coupon_code?: string | null;
    payment_method?: string | null;
    order_id?: string | null;
    source: "calculate_cart_total" | "submit_final_order";
    updated_at: string;
};
type ExistingOrderRow = {
    id: string;
    items: unknown;
    subtotal: number | null;
    discount: number | null;
    delivery_fee: number | null;
    total: number | null;
    payment_method: string | null;
    change_for: number | null;
    address_number: string | null;
    address_reference: string | null;
    gps_location: string | null;
    created_at?: string | null;
};
const GOOGLE_MAPS_REQUEST_TIMEOUT_MS = 8000;

const STORE_INFO_CACHE_TTL_MS = 5 * 60 * 1000;
const STORE_INFO_CACHE = new Map<string, { expiresAt: number; data: unknown }>();

const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const CATALOG_CACHE = new Map<string, { expiresAt: number; data: unknown }>();

function createAdminClient(): SupabaseClient {
    return createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown error during tool execution.";
}

function logToolEvent(event: string, details: Record<string, unknown> = {}) {
    console.log("[AI TOOL OBS]", {
        event,
        at: new Date().toISOString(),
        ...details,
    });
}

async function fetchWithTimeout(
    input: string,
    init: RequestInit,
    timeoutMs: number
) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutHandle);
    }
}

function toCartItems(value: unknown): CartItem[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .map((item) => ({
            product_id: typeof item.product_id === "string" ? item.product_id : undefined,
            quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
        }));
}

function buildItemsSignature(items: CartItem[]) {
    return items
        .filter((item) => item.product_id)
        .map((item) => `${item.product_id}:${item.quantity}`)
        .sort()
        .join("|");
}

function normalizeMoney(value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }

    return Number(numeric.toFixed(2));
}

function getStringOrEmpty(value: unknown) {
    return typeof value === "string" ? value : "";
}

function isDuplicateOrderMatch(
    order: ExistingOrderRow,
    itemsSignature: string,
    realSubtotal: number,
    appliedDiscount: number,
    appliedDeliveryFee: number,
    finalTotal: number,
    args: Record<string, unknown>
) {
    const orderItemsSignature = buildItemsSignature(toCartItems(order.items));
    return (
        orderItemsSignature === itemsSignature &&
        normalizeMoney(order.subtotal) === normalizeMoney(realSubtotal) &&
        normalizeMoney(order.discount) === normalizeMoney(appliedDiscount) &&
        normalizeMoney(order.delivery_fee) === normalizeMoney(appliedDeliveryFee) &&
        normalizeMoney(order.total) === normalizeMoney(finalTotal) &&
        getStringOrEmpty(order.payment_method).toLowerCase() ===
        getStringOrEmpty(args.payment_method).toLowerCase() &&
        normalizeMoney(order.change_for) === normalizeMoney(args.change_for) &&
        getStringOrEmpty(order.address_number) === getStringOrEmpty(args.address_number) &&
        getStringOrEmpty(order.address_reference) === getStringOrEmpty(args.address_reference) &&
        getStringOrEmpty(order.gps_location) === getStringOrEmpty(args.gps_location)
    );
}

async function persistCartSnapshot(
    db: SupabaseClient,
    ctx: ToolContext,
    snapshot: CartSnapshot
) {
    const result = await persistChatCartSnapshot(db, ctx, snapshot);
    if (!result.ok && !result.skipped) {
        console.error("[AI_TOOL_HANDLER] Failed to persist cart snapshot:", result.reason);
        return;
    }

    if (result.ok) {
        logToolEvent("cart_snapshot_updated", {
            restaurantId: ctx.restaurant_id,
            chatId: ctx.chat_id,
            source: snapshot.source,
            total: snapshot.total,
            itemsCount: snapshot.items.length,
        });
    }
}

function computeIsOpenNow(operatingHours: unknown) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const weekdayStr = parts.find((part) => part.type === "weekday")?.value || "";
    const hourStr = parts.find((part) => part.type === "hour")?.value || "00";
    const minuteStr = parts.find((part) => part.type === "minute")?.value || "00";
    const daysMap: Record<string, string> = {
        Monday: "segunda",
        Tuesday: "terca",
        Wednesday: "quarta",
        Thursday: "quinta",
        Friday: "sexta",
        Saturday: "sabado",
        Sunday: "domingo",
    };

    const currentDayKey = daysMap[weekdayStr];
    const parsedHours =
        typeof operatingHours === "string"
            ? (() => {
                try {
                    return JSON.parse(operatingHours) as OperatingHoursMap;
                } catch {
                    return {};
                }
            })()
            : ((operatingHours as OperatingHoursMap) || {});
    const hours = parsedHours;
    const todayHours = currentDayKey ? hours[currentDayKey] : undefined;

    if (!todayHours || todayHours.isClosed || !todayHours.open || !todayHours.close) {
        return false;
    }

    const currH = Number(hourStr);
    const currM = Number(minuteStr);
    const [openH, openM] = todayHours.open.split(":").map(Number);
    const [closeH, closeM] = todayHours.close.split(":").map(Number);

    const currentTotalMinutes = currH * 60 + currM;
    const openTotalMinutes = openH * 60 + openM;
    const closeTotalMinutes = closeH * 60 + closeM;

    if (closeTotalMinutes < openTotalMinutes) {
        return currentTotalMinutes >= openTotalMinutes || currentTotalMinutes <= closeTotalMinutes;
    }

    return currentTotalMinutes >= openTotalMinutes && currentTotalMinutes <= closeTotalMinutes;
}

function normalizeGpsDestination(gpsLocation: unknown) {
    const raw = typeof gpsLocation === "string" ? gpsLocation.trim() : "";
    if (!raw) {
        return "";
    }

    const latLngAssignmentMatch = raw.match(
        /lat\s*=\s*(-?\d+(?:\.\d+)?)\s+lng\s*=\s*(-?\d+(?:\.\d+)?)/i
    );
    if (latLngAssignmentMatch) {
        return `${latLngAssignmentMatch[1]},${latLngAssignmentMatch[2]}`;
    }

    const csvMatch = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (csvMatch) {
        return `${csvMatch[1]},${csvMatch[2]}`;
    }

    return "";
}

/**
 * Dispatcher principal.
 * Garante que cada ferramenta chamada pelo Gemini chegue ao handler correto.
 */
export async function executeAiTool(
    toolName: string,
    args: Record<string, unknown>,
    ctx: ToolContext
): Promise<string> {
    const handlers: Record<string, () => Promise<unknown>> = {
        get_store_info: () => handleGetStoreInfo(ctx),
        search_product_catalog: () => handleSearchProductCatalog(args, ctx),
        calculate_cart_total: () => handleCalculateCartTotal(args, ctx),
        submit_final_order: () => handleSubmitFinalOrder(args, ctx),
        get_pix_payment: () => handleGetPixPayment(args, ctx),
        schedule_proactive_followup: () => handleScheduleFollowup(args, ctx),
        send_uaz_carousel: () => handleSendUazCarousel(args, ctx),
        send_uaz_buttons: () => handleSendUazButtons(args, ctx),
        request_user_location: () => handleRequestUserLocation(ctx),
        move_kanban_stage: () => handleMoveKanbanStage(args, ctx),
    };

    const handler = handlers[toolName];

    if (!handler) {
        return JSON.stringify({
            error: "UNKNOWN_TOOL",
            message: `Tool "${toolName}" is not registered.`,
        });
    }

    try {
        const result = await handler();
        return JSON.stringify(result);
    } catch (err: unknown) {
        console.error(`[AI_TOOL_HANDLER] Error in "${toolName}":`, err);
        return JSON.stringify({
            error: "TOOL_EXECUTION_ERROR",
            message: getErrorMessage(err),
        });
    }
}

async function handleGetStoreInfo(ctx: ToolContext) {
    const now = Date.now();
    const cached = STORE_INFO_CACHE.get(ctx.restaurant_id);
    if (cached && cached.expiresAt > now) {
        logToolEvent("store_info_cache_hit", { restaurantId: ctx.restaurant_id });
        return cached.data;
    }

    const db = createAdminClient();
    const storeSelectOptions = [
        "name, store_address, operating_hours, business_rules, description, logo_url, pix_key",
        "name, store_address, operating_hours, description, logo_url, pix_key",
        "name, store_address, operating_hours, logo_url, pix_key",
    ];

    let storeQuery = await db
        .from("restaurants")
        .select(storeSelectOptions[0])
        .eq("id", ctx.restaurant_id)
        .single();

    for (let index = 1; storeQuery.error && index < storeSelectOptions.length; index += 1) {
        storeQuery = await db
            .from("restaurants")
            .select(storeSelectOptions[index])
            .eq("id", ctx.restaurant_id)
            .single();
    }

    const { data, error } = storeQuery;
    if (error) return { ok: false, error: error.message };

    const storeData = (data ?? {}) as unknown as Record<string, unknown>;

    const result = {
        ok: true,
        store_info: {
            ...storeData,
            business_rules:
                typeof storeData.business_rules !== "undefined"
                    ? storeData.business_rules
                    : null,
            description:
                typeof storeData.description === "string"
                    ? storeData.description
                    : null,
            address: typeof storeData.store_address === "string" ? storeData.store_address : null,
            business_hours: storeData.operating_hours ?? null,
            is_open_now: computeIsOpenNow(storeData.operating_hours),
        },
    };

    if (STORE_INFO_CACHE.size > 500) {
        const oldestKey = STORE_INFO_CACHE.keys().next().value;
        if (oldestKey) STORE_INFO_CACHE.delete(oldestKey);
    }
    STORE_INFO_CACHE.set(ctx.restaurant_id, { expiresAt: now + STORE_INFO_CACHE_TTL_MS, data: result });
    return result;
}

async function handleSearchProductCatalog(
    args: Record<string, unknown>,
    ctx: ToolContext
) {
    const categoryName = typeof args.category === "string" ? args.category.trim() : "";
    const searchTerm = typeof args.query === "string" ? args.query.trim() : "";
    const cacheKey = `${ctx.restaurant_id}:${categoryName}:${searchTerm}`;
    const now = Date.now();
    const cached = CATALOG_CACHE.get(cacheKey);

    if (cached && cached.expiresAt > now) {
        logToolEvent("product_catalog_cache_hit", { restaurantId: ctx.restaurant_id, cacheKey });
        return cached.data;
    }

    const db = createAdminClient();
    let query = db
        .from("produtos_promo")
        .select("id, nome, description, preco_original, preco_promo, imagem_url, category")
        .eq("restaurant_id", ctx.restaurant_id);

    if (categoryName) {
        query = query.eq("category", categoryName);
    }

    if (searchTerm) {
        query = query.ilike("nome", `%${searchTerm}%`);
    }

    const { data, error } = await query.order("nome");
    if (error) return { ok: false, error: error.message };

    const mappedProducts = ((data || []) as CatalogProductRow[]).map((p) => ({
        product_id: p.id,
        title: p.nome || "",
        description: p.description || "",
        price: p.preco_original || p.preco_promo || 0,
        promo_price: p.preco_promo || null,
        image_url: p.imagem_url || "",
    }));

    const result = { ok: true, products: mappedProducts };

    if (CATALOG_CACHE.size > 1000) {
        const oldestKey = CATALOG_CACHE.keys().next().value;
        if (oldestKey) CATALOG_CACHE.delete(oldestKey);
    }
    CATALOG_CACHE.set(cacheKey, { expiresAt: now + CATALOG_CACHE_TTL_MS, data: result });
    return result;
}

async function handleCalculateCartTotal(args: Record<string, unknown>, ctx: ToolContext) {
    const db = createAdminClient();
    const items = toCartItems(args.items);
    let subtotal = 0;
    let deliverySource = "none";
    let snapshotItems = items;

    const productIds = items.map((i) => i.product_id).filter(Boolean);
    if (productIds.length > 0) {
        const { data: products } = await db
            .from("produtos_promo")
            .select("id, preco_promo, preco_original, category")
            .eq("restaurant_id", ctx.restaurant_id)
            .in("id", productIds);

        if (products) {
            const productMap: Record<string, { price: number; category?: string }> = {};
            products.forEach((p) => {
                productMap[p.id] = {
                    price: p.preco_promo || p.preco_original || 0,
                    category: typeof p.category === "string" ? p.category : undefined,
                };
            });
            for (const item of items) {
                if (!item.product_id) continue;
                subtotal += (productMap[item.product_id]?.price || 0) * item.quantity;
            }
            snapshotItems = items.map((item) => ({
                ...item,
                category: item.product_id ? productMap[item.product_id]?.category : undefined,
            }));
        }
    }

    const explicitCouponCode =
        typeof args.cupom_code === "string" ? args.cupom_code.trim() : "";
    const activeCouponCode = explicitCouponCode || await getActiveChatCouponCode(db, ctx.chat_id);
    const discount = calculateCouponDiscount(subtotal, activeCouponCode);
    const subtotalAfterDiscount = Math.max(subtotal - discount, 0);

    let delivery_fee = 0;
    let distance_km = 0;

    const { data: rest } = await db
        .from("restaurants")
        .select("delivery_price_per_km, free_delivery_threshold, store_address")
        .eq("id", ctx.restaurant_id)
        .single();

    const pricePerKm = Number(rest?.delivery_price_per_km) || 0;
    const freeDeliveryThreshold = Number(rest?.free_delivery_threshold) || 0;
    const customerAddress =
        typeof args.customer_address === "string" ? args.customer_address.trim() : "";
    const gpsDestination = normalizeGpsDestination(args.gps_location);

    if (freeDeliveryThreshold > 0 && subtotalAfterDiscount >= freeDeliveryThreshold) {
        delivery_fee = 0;
        deliverySource = "free_delivery_threshold";
    } else if (gpsDestination && rest?.store_address && GOOGLE_MAPS_API_KEY) {
        try {
            const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
                rest.store_address
            )}&destinations=${encodeURIComponent(
                gpsDestination
            )}&key=${GOOGLE_MAPS_API_KEY}`;
            const res = await fetchWithTimeout(url, {}, GOOGLE_MAPS_REQUEST_TIMEOUT_MS);
            const gmData = await res.json();
            if (gmData.status === "OK" && gmData.rows[0].elements[0].status === "OK") {
                distance_km = gmData.rows[0].elements[0].distance.value / 1000;
                delivery_fee = Number(
                    (distance_km * (pricePerKm || 2)).toFixed(2)
                );
                deliverySource = "google_maps_gps";
            } else {
                deliverySource = "google_maps_gps_unavailable";
            }
        } catch (e) {
            console.error("[MAPS_GPS_ERROR]", e);
            deliverySource = "google_maps_gps_error";
        }
    } else if (customerAddress && rest?.store_address && GOOGLE_MAPS_API_KEY) {
        try {
            const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
                rest.store_address
            )}&destinations=${encodeURIComponent(
                customerAddress
            )}&key=${GOOGLE_MAPS_API_KEY}`;
            const res = await fetchWithTimeout(url, {}, GOOGLE_MAPS_REQUEST_TIMEOUT_MS);
            const gmData = await res.json();
            if (gmData.status === "OK" && gmData.rows[0].elements[0].status === "OK") {
                distance_km = gmData.rows[0].elements[0].distance.value / 1000;
                delivery_fee = Number(
                    (distance_km * (pricePerKm || 2)).toFixed(2)
                );
                deliverySource = "google_maps";
            } else {
                deliverySource = "google_maps_unavailable";
            }
        } catch (e) {
            console.error("[MAPS_ERROR]", e);
            deliverySource = "google_maps_error";
        }
    } else if ((customerAddress || gpsDestination) && pricePerKm > 0) {
        distance_km = 5;
        delivery_fee = Number((distance_km * pricePerKm).toFixed(2));
        deliverySource = "fallback_fixed_distance";
    }

    const isFreeDeliveryCoupon = activeCouponCode.toLowerCase().includes("frete") &&
        (activeCouponCode.toLowerCase().includes("gratis") ||
            activeCouponCode.toLowerCase().includes("grátis"));

    if (isFreeDeliveryCoupon) {
        delivery_fee = 0;
        deliverySource = "coupon_free_delivery";
    }

    const total = subtotalAfterDiscount + delivery_fee;
    await persistCartSnapshot(
        db,
        ctx,
        buildCartSnapshotData({
            items: snapshotItems,
            subtotal,
            discount,
            delivery_fee,
            distance_km,
            total,
            applied_coupon_code: activeCouponCode || null,
            source: "calculate_cart_total",
            updated_at: new Date().toISOString(),
        })
    );
    logToolEvent("cart_total_calculated", {
        restaurantId: ctx.restaurant_id,
        chatId: ctx.chat_id || null,
        itemsCount: items.length,
        subtotal: Number(subtotal.toFixed(2)),
        discount: Number(discount.toFixed(2)),
        deliveryFee: delivery_fee,
        distanceKm: Number(distance_km.toFixed(2)),
        deliverySource,
        couponApplied: activeCouponCode || null,
        freeDeliveryThreshold,
        total: Number(total.toFixed(2)),
    });
    return {
        ok: true,
        subtotal,
        discount: Number(discount.toFixed(2)),
        delivery_fee,
        distance_km,
        applied_coupon_code: activeCouponCode || null,
        total: Number(total.toFixed(2)),
    };
}

async function handleSubmitFinalOrder(
    args: Record<string, unknown>,
    ctx: ToolContext
) {
    const db = createAdminClient();

    if (!args.address_number) return { ok: false, error: "MISSING_ADDRESS_NUMBER" };
    if (!args.address_reference) return { ok: false, error: "MISSING_ADDRESS_REFERENCE" };
    if (!args.payment_method) return { ok: false, error: "MISSING_PAYMENT_METHOD" };
    if (!args.gps_location) return { ok: false, error: "MISSING_GPS_LOCATION" };
    if (!args.items || !Array.isArray(args.items)) return { ok: false, error: "MISSING_ITEMS" };
    if (
        String(args.payment_method || "").toLowerCase() === "dinheiro" &&
        (args.change_for === undefined || args.change_for === null)
    ) {
        return { ok: false, error: "MISSING_CHANGE_FOR" };
    }

    const chatId = (args.chat_id as string) || ctx.chat_id;
    const items = toCartItems(args.items);
    let snapshotItems = items;
    if (items.length === 0) {
        return { ok: false, error: "EMPTY_ITEMS" };
    }

    const productIds = items.map((i) => i.product_id).filter(Boolean);
    if (productIds.length === 0) {
        return { ok: false, error: "INVALID_ITEMS" };
    }
    let realSubtotal = 0;
    const { data: products } = await db
        .from("produtos_promo")
        .select("id, preco_promo, preco_original, category")
        .eq("restaurant_id", ctx.restaurant_id)
        .in("id", productIds);

    if (products) {
        const pMap: Record<string, { price: number; category?: string }> = {};
        products.forEach((p) => {
            pMap[p.id] = {
                price: p.preco_promo || p.preco_original || 0,
                category: typeof p.category === "string" ? p.category : undefined,
            };
        });
        for (const item of items) {
            if (!item.product_id) continue;
            realSubtotal += (pMap[item.product_id]?.price || 0) * item.quantity;
        }
        snapshotItems = items.map((item) => ({
            ...item,
            category: item.product_id ? pMap[item.product_id]?.category : undefined,
        }));
    }

    if (realSubtotal <= 0) {
        return { ok: false, error: "INVALID_ORDER_TOTAL" };
    }

    const activeCouponCode = await getActiveChatCouponCode(db, chatId);
    const appliedDiscount = resolveAppliedDiscount(
        realSubtotal,
        args.discount,
        activeCouponCode
    );
    const isFreeDeliveryCoupon = activeCouponCode.toLowerCase().includes("frete") &&
        (activeCouponCode.toLowerCase().includes("gratis") ||
            activeCouponCode.toLowerCase().includes("grátis"));

    const appliedDeliveryFee = isFreeDeliveryCoupon ? 0 : normalizeMoney(args.delivery_fee);
    const finalTotal = realSubtotal - appliedDiscount + appliedDeliveryFee;

    if (finalTotal <= 0) {
        return { ok: false, error: "INVALID_ORDER_TOTAL" };
    }

    const itemsSignature = buildItemsSignature(items);
    let duplicateOrder: ExistingOrderRow | undefined;

    if (ctx.trigger_message_created_at) {
        const { data: recentOrders } = await db
            .from("orders")
            .select("id, items, subtotal, discount, delivery_fee, total, payment_method, change_for, address_number, address_reference, gps_location, created_at")
            .eq("restaurant_id", ctx.restaurant_id)
            .eq("chat_id", chatId)
            .gte("created_at", ctx.trigger_message_created_at)
            .order("created_at", { ascending: false })
            .limit(5);

        duplicateOrder = ((recentOrders || []) as ExistingOrderRow[]).find((order) =>
            isDuplicateOrderMatch(
                order,
                itemsSignature,
                realSubtotal,
                appliedDiscount,
                appliedDeliveryFee,
                finalTotal,
                args
            )
        );
    }

    if (duplicateOrder?.id) {
        logToolEvent("duplicate_order_reused", {
            restaurantId: ctx.restaurant_id,
            chatId,
            orderId: duplicateOrder.id,
            paymentMethod: String(args.payment_method || ""),
            triggerMessageCreatedAt: ctx.trigger_message_created_at || null,
        });
        if (String(args.payment_method || "").toLowerCase() === "pix") {
            return {
                ok: true,
                order_id: duplicateOrder.id,
                requires_pix_payment: true,
                pix_amount: normalizeMoney(duplicateOrder.total || finalTotal),
                duplicate: true,
                message: "Pedido ja registrado. Reaproveitando pedido existente.",
            };
        }

        return {
            ok: true,
            order_id: duplicateOrder.id,
            duplicate: true,
            message: "Pedido ja registrado. Reaproveitando pedido existente.",
        };
    }

    const { data: order, error } = await db
        .from("orders")
        .insert({
            restaurant_id: ctx.restaurant_id,
            chat_id: chatId,
            items,
            subtotal: realSubtotal,
            discount: appliedDiscount,
            delivery_fee: appliedDeliveryFee,
            total: finalTotal,
            payment_method: args.payment_method,
            change_for: args.change_for || null,
            address_number: args.address_number,
            address_reference: args.address_reference || null,
            gps_location: args.gps_location,
            status: "received",
        })
        .select()
        .single();

    if (error) return { ok: false, error: error.message };
    if (!order?.id) return { ok: false, error: "ORDER_NOT_CREATED" };

    logToolEvent("order_created", {
        restaurantId: ctx.restaurant_id,
        chatId,
        orderId: order.id,
        paymentMethod: String(args.payment_method || ""),
        discount: appliedDiscount,
        total: normalizeMoney(order.total),
        itemsCount: items.length,
    });
    await persistCartSnapshot(
        db,
        ctx,
        buildCartSnapshotData({
            items: snapshotItems,
            subtotal: realSubtotal,
            discount: appliedDiscount,
            delivery_fee: appliedDeliveryFee,
            total: finalTotal,
            applied_coupon_code: activeCouponCode || null,
            payment_method: String(args.payment_method || ""),
            order_id: order.id,
            source: "submit_final_order",
            updated_at: new Date().toISOString(),
        })
    );

    await db.from("webhook_logs").insert({
        restaurant_id: ctx.restaurant_id,
        chat_id: chatId,
        tag_disparada: "ORDER_CREATED",
        status: "dispatched",
    });

    if (String(args.payment_method || "").toLowerCase() === "pix") {
        return {
            ok: true,
            order_id: order.id,
            requires_pix_payment: true,
            pix_amount: order.total,
            message: "Pedido registrado. Gerando PIX...",
        };
    }

    return { ok: true, order_id: order.id, message: "Pedido registrado!" };
}

async function handleGetPixPayment(args: Record<string, unknown>, ctx: ToolContext) {
    const db = createAdminClient();
    const amount = Number(args.amount);
    if (!amount) return { ok: false, error: "MISSING_AMOUNT" };

    const { data: rest } = await db
        .from("restaurants")
        .select("name, pix_key")
        .eq("id", ctx.restaurant_id)
        .single();
    if (!rest?.pix_key) return { ok: false, error: "PIX_KEY_NOT_CONFIGURED" };

    const cleanNumber = ctx.wa_chat_id?.split("@")[0].replace(/\D/g, "");

    return {
        ok: true,
        uazapi_payload: {
            number: cleanNumber,
            amount: Number(amount.toFixed(2)),
            text: `Pagamento do seu pedido no ${rest.name}`,
            pixKey: rest.pix_key,
            pixType: "EVP",
        },
    };
}

async function handleSendUazCarousel(args: Record<string, unknown>, ctx: ToolContext) {
    const db = createAdminClient();
    const products = Array.isArray(args.products) ? (args.products as Record<string, unknown>[]) : [];
    const cleanNumber = ctx.wa_chat_id?.split("@")[0].replace(/\D/g, "");
    const activeCouponCode = await getActiveChatCouponCode(db, ctx.chat_id);

    const productIds = products
        .map((p) => (typeof p?.product_id === "string" ? p.product_id : null))
        .filter((id): id is string => Boolean(id));

    if (productIds.length === 0) {
        return { ok: false, error: "NO_VALID_PRODUCTS_FOR_CAROUSEL" };
    }

    const { data: dbProducts, error } = await db
        .from("produtos_promo")
        .select("id, nome, description, preco_original, preco_promo, imagem_url")
        .eq("restaurant_id", ctx.restaurant_id)
        .in("id", productIds);

    if (error) {
        return { ok: false, error: error.message };
    }

    const productMap = new Map(
        (dbProducts || []).map((p) => [
            p.id,
            {
                product_id: p.id,
                title: p.nome,
                description: p.description || "",
                price: Number(p.preco_original || p.preco_promo || 0),
                promo_price: p.preco_promo == null ? null : Number(p.preco_promo),
                image_url: p.imagem_url || "",
            },
        ])
    );

    const normalizedProducts = productIds
        .map((id) => productMap.get(id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p));

    if (normalizedProducts.length === 0) {
        return { ok: false, error: "NO_VALID_PRODUCTS_FOR_CAROUSEL" };
    }

    const limitedProducts = normalizedProducts.slice(0, 10);

    const cards = limitedProducts.map((p) => {
        const priceText = buildCarouselPriceText({
            price: Number(p.price),
            promoPrice: p.promo_price == null ? null : Number(p.promo_price),
            activeCouponCode,
        });

        const buttonLabel = `Add ${p.title}`.substring(0, 20);
        const imageUrl =
            typeof p.image_url === "string" && /^https?:\/\//i.test(p.image_url)
                ? p.image_url
                : typeof p.image_url === "string" && p.image_url.startsWith("/")
                    ? `${ctx.base_url.replace(/\/$/, "")}${p.image_url}`
                    : "";

        return {
            text: `*${p.title}*\n\n${p.description}\n\n${priceText}`,
            image: imageUrl,
            buttons: [
                {
                    id: `add_${p.product_id}`,
                    text: buttonLabel,
                    type: "REPLY",
                },
            ],
        };
    });

    logToolEvent("carousel_built", {
        restaurantId: ctx.restaurant_id,
        chatId: ctx.chat_id || null,
        productsCount: cards.length,
        activeCouponCode: activeCouponCode || null,
    });

    return {
        ok: true,
        uazapi_payload: {
            number: cleanNumber,
            text: args.text || "Confira nossas opcoes:",
            carousel: cards,
            delay: 1000,
        },
    };
}

async function handleSendUazButtons(args: Record<string, unknown>, ctx: ToolContext) {
    const cleanNumber = ctx.wa_chat_id?.split("@")[0].replace(/\D/g, "");
    return {
        ok: true,
        uazapi_payload: {
            number: cleanNumber,
            type: "button",
            text: args.text || "Escolha uma opcao:",
            choices: args.choices || [],
            footerText: args.footerText || "Selecione abaixo",
        },
    };
}

async function handleRequestUserLocation(ctx: ToolContext) {
    const cleanNumber = ctx.wa_chat_id?.split("@")[0].replace(/\D/g, "");
    return {
        ok: true,
        uazapi_payload: {
            number: cleanNumber,
            text: "Para continuar o atendimento, clique no botao abaixo e compartilhe sua localizacao",
            delay: 0,
            readchat: true,
            locationButton: true,
        },
    };
}

async function handleScheduleFollowup(args: Record<string, unknown>, ctx: ToolContext) {
    const db = createAdminClient();
    const runAt = new Date(
        Date.now() + (Number(args.minutes_delay) || 30) * 60 * 1000
    ).toISOString();
    const intent =
        typeof args.intent === "string" && args.intent.trim().length > 0
            ? args.intent.trim()
            : "follow_up";
    const followupState = await getChatFollowupState(db, ctx.chat_id);
    const scheduledPayload = buildScheduledFollowupPayload({
        existingPayload: args.payload,
        intent,
        cartSnapshot: followupState?.cart_snapshot ?? null,
        kanbanStatus:
            typeof followupState?.kanban_status === "string"
                ? followupState.kanban_status
                : null,
        cupomGanho:
            typeof followupState?.cupom_ganho === "string"
                ? followupState.cupom_ganho
                : null,
        generatedAt: new Date().toISOString(),
    });
    const persistedFollowupPayload = {
        ...scheduledPayload,
        chat_id: ctx.chat_id || null,
    };
    const { data, error } = await db
        .from("scheduled_messages")
        .insert({
            restaurant_id: ctx.restaurant_id,
            wa_chat_id: ctx.wa_chat_id || "",
            run_at: runAt,
            intent,
            payload: persistedFollowupPayload,
            status: "pending",
        })
        .select()
        .single();
    if (error) return { ok: false, error: error.message };
    logToolEvent("followup_scheduled", {
        restaurantId: ctx.restaurant_id,
        chatId: ctx.chat_id || null,
        scheduledId: data.id,
        runAt,
        intent,
        nextStep:
            typeof (persistedFollowupPayload as { resume_context?: { next_step?: string } }).resume_context
                ?.next_step === "string"
                ? (persistedFollowupPayload as { resume_context?: { next_step?: string } }).resume_context?.next_step
                : null,
    });
    return { ok: true, scheduled_id: data.id };
}

async function handleMoveKanbanStage(args: Record<string, unknown>, ctx: ToolContext) {
    const db = createAdminClient();
    const chatId = (args.chat_id as string) || ctx.chat_id;
    const stageName = args.stage_name as string;
    const { data: stage } = await db
        .from("kanban_stages")
        .select("id, name")
        .eq("restaurant_id", ctx.restaurant_id)
        .eq("name", stageName)
        .maybeSingle();

    if (!stage) return { ok: false, error: "STAGE_NOT_FOUND" };

    const updatePayload: Record<string, unknown> = {
        stage_id: stage.id,
        kanban_status: stage.name,
    };

    await db.from("chats").update(updatePayload).eq("id", chatId);
    return { ok: true, message: `Moved to ${stage.name}` };
}
