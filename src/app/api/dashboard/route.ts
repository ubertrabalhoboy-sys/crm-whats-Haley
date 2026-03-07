import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateRecoveredSales, estimateHumanHoursSaved } from "@/lib/metrics/roi";
import { deriveWhatsappHealth } from "@/lib/whatsapp/health";
import { AI_COST_USD_TO_BRL } from "@/lib/shared/env";

export const dynamic = "force-dynamic";

type AutomationRunRow = {
    chat_id: string | null;
    created_at: string | null;
    executed_at: string | null;
    status: string | null;
    trigger: string | null;
};

type OrderRow = {
    id: string;
    chat_id: string | null;
    total: number | null;
    created_at: string | null;
};

type AiTurnOutcomeRow = {
    outcome: string | null;
};
type AiLogCostRow = {
    model: string | null;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    created_at: string | null;
};

type ProdutoPromoRow = {
    id: string;
    nome: string;
    preco_original: number | null;
    preco_promo: number | null;
    estoque: number | null;
    imagem_url: string | null;
    category: string | null;
    is_extra: boolean | null;
    created_at: string | null;
};

type NotificationWarningRow = {
    title: string | null;
    message: string | null;
    created_at: string | null;
};

type ModelCostRollup = {
    model: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    costBrl: number;
};

const MODEL_PRICING_USD_PER_1M: Record<string, { input: number; output: number }> = {
    "gemini-2.5-flash": { input: 0.3, output: 2.5 },
    "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

function normalizeCategory(value: string | null | undefined) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeModelPricingKey(value: string | null | undefined) {
    const model = String(value || "").trim().toLowerCase();
    if (model.includes("gemini-2.5-flash-lite")) return "gemini-2.5-flash-lite";
    if (model.includes("gemini-2.5-flash")) return "gemini-2.5-flash";
    if (model.includes("gpt-4o-mini")) return "gpt-4o-mini";
    return "";
}

function pickTopProduct(
    products: ProdutoPromoRow[],
    predicate: (row: ProdutoPromoRow) => boolean
) {
    return products.find(predicate) || null;
}

export async function GET() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("restaurant_id")
        .eq("id", user.id)
        .maybeSingle();

    if (!profile?.restaurant_id) {
        return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const AVERAGE_HUMAN_MINUTES_PER_TURN = 2.5;

    const [
        totalLeadsCountResult,
        leadsHojeCountResult,
        leadsSemanaCountResult,
        chatsComVendaCountResult,
        girosRoletaCountResult,
        produtosResult,
    ] = await Promise.all([
        supabase
            .from("chats")
            .select("id", { count: "exact", head: true })
            .eq("restaurant_id", profile.restaurant_id),
        supabase
            .from("chats")
            .select("id", { count: "exact", head: true })
            .eq("restaurant_id", profile.restaurant_id)
            .gte("created_at", todayStart.toISOString()),
        supabase
            .from("chats")
            .select("id", { count: "exact", head: true })
            .eq("restaurant_id", profile.restaurant_id)
            .gte("created_at", sevenDaysAgo.toISOString()),
        supabase
            .from("chats")
            .select("id", { count: "exact", head: true })
            .eq("restaurant_id", profile.restaurant_id)
            .eq("kanban_status", "ganho"),
        supabase
            .from("chats")
            .select("id", { count: "exact", head: true })
            .eq("restaurant_id", profile.restaurant_id)
            .ilike("origem_lead", "roleta"),
        supabase
            .from("produtos_promo")
            .select("id, nome, preco_original, preco_promo, estoque, imagem_url, category, is_extra, created_at")
            .eq("restaurant_id", profile.restaurant_id)
            .order("created_at", { ascending: false })
            .limit(120),
    ]);

    if (totalLeadsCountResult.error) {
        return NextResponse.json({ ok: false, error: totalLeadsCountResult.error.message }, { status: 500 });
    }
    if (leadsHojeCountResult.error) {
        return NextResponse.json({ ok: false, error: leadsHojeCountResult.error.message }, { status: 500 });
    }
    if (leadsSemanaCountResult.error) {
        return NextResponse.json({ ok: false, error: leadsSemanaCountResult.error.message }, { status: 500 });
    }
    if (chatsComVendaCountResult.error) {
        return NextResponse.json({ ok: false, error: chatsComVendaCountResult.error.message }, { status: 500 });
    }
    if (girosRoletaCountResult.error) {
        return NextResponse.json({ ok: false, error: girosRoletaCountResult.error.message }, { status: 500 });
    }
    if (produtosResult.error) {
        return NextResponse.json({ ok: false, error: produtosResult.error.message }, { status: 500 });
    }

    const totalLeads = totalLeadsCountResult.count || 0;
    const leadsHoje = leadsHojeCountResult.count || 0;
    const leadsSemana = leadsSemanaCountResult.count || 0;
    const chatsComVenda = chatsComVendaCountResult.count || 0;
    const girosRoleta = girosRoletaCountResult.count || 0;
    const taxaConversao = totalLeads > 0 ? (chatsComVenda / totalLeads) * 100 : 0;
    const produtos = (produtosResult.data || []) as ProdutoPromoRow[];

    const topHighlights = {
        principal: pickTopProduct(
            produtos,
            (row) => normalizeCategory(row.category) === "principal"
        ),
        adicional:
            pickTopProduct(
                produtos,
                (row) =>
                    normalizeCategory(row.category) === "adicional" &&
                    !Boolean(row.is_extra)
            ) ||
            pickTopProduct(
                produtos,
                (row) => normalizeCategory(row.category) === "adicional"
            ),
        bebida: pickTopProduct(
            produtos,
            (row) => normalizeCategory(row.category) === "bebida"
        ),
        complemento: pickTopProduct(produtos, (row) => Boolean(row.is_extra)),
    };

    let roi = {
        recoveredSales7d: 0,
        recoveredOrders7d: 0,
        recoveryRuns7d: 0,
        recoveryConversionRate7d: 0,
        recoveredSalesMonth: 0,
        recoveredOrdersMonth: 0,
        recoveryRunsMonth: 0,
        recoveryConversionRateMonth: 0,
        successfulAiTurnsMonth: 0,
        estimatedHoursSavedMonth: 0,
        averageHumanMinutesPerTurn: AVERAGE_HUMAN_MINUTES_PER_TURN,
        aiCost7dUsd: 0,
        aiCost7dBrl: 0,
        aiCostMonthUsd: 0,
        aiCostMonthBrl: 0,
        aiCostByModelMonth: [] as ModelCostRollup[],
        netRecoveredAfterAiCostMonth: 0,
    };

    const { data: automationRuns, error: automationRunsError } = await supabase
        .from("automation_runs")
        .select("chat_id, created_at, executed_at, status, trigger")
        .eq("restaurant_id", profile.restaurant_id)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);

    if (automationRunsError) {
        console.warn("[dashboard] ROI automation_runs unavailable:", automationRunsError.message);
    } else {
        const successfulRecoveryRuns = ((automationRuns || []) as AutomationRunRow[]).filter(
            (run) => run.status === "success" && run.trigger === "abandoned_cart_recovery"
        );

        if (successfulRecoveryRuns.length > 0) {
            const chatIds = Array.from(
                new Set(
                    successfulRecoveryRuns
                        .map((run) => run.chat_id)
                        .filter((value): value is string => typeof value === "string" && value.length > 0)
                )
            );

            if (chatIds.length > 0) {
                const runTimes = successfulRecoveryRuns
                    .map((run) => new Date(run.executed_at || run.created_at || "").getTime())
                    .filter((value) => Number.isFinite(value));
                const earliestRunMs = runTimes.length > 0 ? Math.min(...runTimes) : Date.now();
                const earliestRunIso = new Date(earliestRunMs).toISOString();

                const { data: orders, error: ordersError } = await supabase
                    .from("orders")
                    .select("id, chat_id, total, created_at")
                    .eq("restaurant_id", profile.restaurant_id)
                    .in("chat_id", chatIds)
                    .gte("created_at", earliestRunIso)
                    .order("created_at", { ascending: true })
                    .limit(2000);

                if (ordersError) {
                    console.warn("[dashboard] ROI orders unavailable:", ordersError.message);
                } else {
                    const typedOrders = (orders || []) as OrderRow[];
                    const sevenDaysIso = sevenDaysAgo.toISOString();
                    const runs7d = successfulRecoveryRuns.filter(
                        (run) => typeof run.created_at === "string" && run.created_at >= sevenDaysIso
                    );

                    const summaryMonth = calculateRecoveredSales({
                        runs: successfulRecoveryRuns,
                        orders: typedOrders,
                        horizonHours: 24,
                    });
                    const summary7d = calculateRecoveredSales({
                        runs: runs7d,
                        orders: typedOrders,
                        horizonHours: 24,
                    });

                    roi = {
                        ...roi,
                        recoveredSales7d: summary7d.recoveredRevenue,
                        recoveredOrders7d: summary7d.recoveredOrders,
                        recoveryRuns7d: summary7d.recoveryRuns,
                        recoveryConversionRate7d: summary7d.conversionRate,
                        recoveredSalesMonth: summaryMonth.recoveredRevenue,
                        recoveredOrdersMonth: summaryMonth.recoveredOrders,
                        recoveryRunsMonth: summaryMonth.recoveryRuns,
                        recoveryConversionRateMonth: summaryMonth.conversionRate,
                    };
                }
            }
        }
    }

    const { data: aiTurns, error: aiTurnsError } = await supabase
        .from("ai_turn_metrics")
        .select("outcome")
        .eq("restaurant_id", profile.restaurant_id)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .limit(5000);

    if (aiTurnsError) {
        console.warn("[dashboard] ROI ai_turn_metrics unavailable:", aiTurnsError.message);
    } else {
        const successfulAiTurns = ((aiTurns || []) as AiTurnOutcomeRow[]).filter(
            (row) => row.outcome === "text_sent" || row.outcome === "payload_sent"
        ).length;

        roi = {
            ...roi,
            successfulAiTurnsMonth: successfulAiTurns,
            estimatedHoursSavedMonth: estimateHumanHoursSaved(
                successfulAiTurns,
                AVERAGE_HUMAN_MINUTES_PER_TURN
            ),
        };
    }

    const { data: aiLogsCostRows, error: aiLogsCostError } = await supabase
        .from("ai_logs")
        .select("model, prompt_tokens, completion_tokens, created_at")
        .eq("restaurant_id", profile.restaurant_id)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .limit(10000);

    if (aiLogsCostError) {
        console.warn("[dashboard] ROI ai_logs cost unavailable:", aiLogsCostError.message);
    } else {
        const sevenDaysIso = sevenDaysAgo.toISOString();
        const typedLogs = (aiLogsCostRows || []) as AiLogCostRow[];
        const modelRollup = new Map<string, ModelCostRollup>();
        let monthUsd = 0;
        let sevenDaysUsd = 0;

        for (const row of typedLogs) {
            const modelKey = normalizeModelPricingKey(row.model);
            const pricing = MODEL_PRICING_USD_PER_1M[modelKey];
            if (!pricing) continue;

            const promptTokens = Math.max(0, Number(row.prompt_tokens || 0));
            const completionTokens = Math.max(0, Number(row.completion_tokens || 0));
            const costUsd =
                (promptTokens / 1_000_000) * pricing.input +
                (completionTokens / 1_000_000) * pricing.output;

            monthUsd += costUsd;
            if (typeof row.created_at === "string" && row.created_at >= sevenDaysIso) {
                sevenDaysUsd += costUsd;
            }

            const current = modelRollup.get(modelKey) || {
                model: modelKey,
                promptTokens: 0,
                completionTokens: 0,
                costUsd: 0,
                costBrl: 0,
            };
            current.promptTokens += promptTokens;
            current.completionTokens += completionTokens;
            current.costUsd += costUsd;
            current.costBrl = current.costUsd * AI_COST_USD_TO_BRL;
            modelRollup.set(modelKey, current);
        }

        const monthBrl = monthUsd * AI_COST_USD_TO_BRL;
        const sevenDaysBrl = sevenDaysUsd * AI_COST_USD_TO_BRL;
        const rollupList = Array.from(modelRollup.values()).sort(
            (a, b) => b.costBrl - a.costBrl
        );

        roi = {
            ...roi,
            aiCost7dUsd: Number(sevenDaysUsd.toFixed(4)),
            aiCost7dBrl: Number(sevenDaysBrl.toFixed(2)),
            aiCostMonthUsd: Number(monthUsd.toFixed(4)),
            aiCostMonthBrl: Number(monthBrl.toFixed(2)),
            aiCostByModelMonth: rollupList.map((item) => ({
                ...item,
                costUsd: Number(item.costUsd.toFixed(4)),
                costBrl: Number(item.costBrl.toFixed(2)),
            })),
            netRecoveredAfterAiCostMonth: Number(
                Math.max(roi.recoveredSalesMonth - monthBrl, 0).toFixed(2)
            ),
        };
    }

    const [restaurantRow, automationRow, firstLog, lastWarning] = await Promise.all([
        supabase
            .from("restaurants")
            .select("uaz_status, store_address, pix_key")
            .eq("id", profile.restaurant_id)
            .single(),
        supabase
            .from("automations")
            .select("id")
            .eq("restaurant_id", profile.restaurant_id)
            .eq("enabled", true)
            .not("trigger", "is", null)
            .limit(1)
            .maybeSingle(),
        supabase
            .from("webhook_logs")
            .select("id")
            .eq("restaurant_id", profile.restaurant_id)
            .limit(1)
            .maybeSingle(),
        supabase
            .from("notifications")
            .select("title, message, created_at")
            .eq("restaurant_id", profile.restaurant_id)
            .eq("type", "warning")
            .eq("is_read", false)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    const uazStatus = String(restaurantRow.data?.uaz_status || "").toLowerCase();
    const isConnected = ["open", "connected", "ready", "online"].includes(uazStatus);
    const warningData = (lastWarning.data ?? null) as NotificationWarningRow | null;
    const whatsappHealth = deriveWhatsappHealth({
        uazStatus,
        warningTitle: warningData?.title,
        warningMessage: warningData?.message,
        warningCreatedAt: warningData?.created_at,
    });

    const onboarding = {
        whatsappConnected: isConnected,
        storeConfigured: !!(restaurantRow.data?.store_address && restaurantRow.data?.pix_key),
        automationConfigured: !!automationRow.data,
        firstLeadMoved: !!firstLog.data,
    };

    return NextResponse.json(
        {
            ok: true,
            metrics: {
                leadsHoje,
                leadsSemana,
                taxaConversao,
                girosRoleta,
                chatsComVenda,
                totalLeads,
            },
            topProdutos: produtos.slice(0, 10),
            topHighlights,
            roi,
            whatsappHealth,
            onboarding,
        },
        { status: 200 }
    );
}
