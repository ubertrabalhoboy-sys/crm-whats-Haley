import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateRecoveredSales, estimateHumanHoursSaved } from "@/lib/metrics/roi";
import { deriveWhatsappHealth } from "@/lib/whatsapp/health";

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

type NotificationWarningRow = {
    title: string | null;
    message: string | null;
    created_at: string | null;
};

export async function GET() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const { data: profile } = await supabase
        .from("profiles")
        .select("restaurant_id")
        .eq("id", user.id)
        .maybeSingle();

    if (!profile?.restaurant_id) {
        return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 });
    }

    // 1. Fetch Chats for metrics computation
    const { data: chats, error: chatsError } = await supabase
        .from("chats")
        .select("created_at, kanban_status, origem_lead")
        .eq("restaurant_id", profile.restaurant_id);

    if (chatsError) {
        return NextResponse.json({ ok: false, error: chatsError.message }, { status: 500 });
    }

    // 2. Fetch Top Promo Products
    // Assuming the top products are just the recently added ones or we just show them in a list.
    const { data: produtos, error: produtosError } = await supabase
        .from("produtos_promo")
        .select("*")
        .eq("restaurant_id", profile.restaurant_id)
        .order("created_at", { ascending: false })
        .limit(10);

    if (produtosError) {
        return NextResponse.json({ ok: false, error: produtosError.message }, { status: 500 });
    }

    // 3. Fetch Webhook Logs (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: webhookLogs } = await supabase
        .from("webhook_logs")
        .select("status, created_at, tag_disparada")
        .eq("restaurant_id", profile.restaurant_id)
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: true });

    // Filter out internal system logs from being counted as Marketing/WhatsApp "Sent Messages"
    const logs = (webhookLogs || []).filter(log => log.tag_disparada !== "ORDER_CREATED");

    const today = new Date().toISOString().slice(0, 10);

    // Group by day
    const porDia: Record<string, { success: number; error: number }> = {};
    for (const log of logs) {
        const dia = log.created_at?.slice(0, 10) || today;
        if (!porDia[dia]) porDia[dia] = { success: 0, error: 0 };
        porDia[dia][log.status === "error" ? "error" : "success"]++;
    }

    const webhookStats = {
        total7d: logs.length,
        hoje: logs.filter(l => (l.created_at?.slice(0, 10) || "") === today).length,
        successCount: logs.filter(l => l.status === "success").length,
        errorCount: logs.filter(l => l.status === "error").length,
        porDia: Object.entries(porDia).map(([dia, counts]) => ({ dia, ...counts }))
    };

    const chatsList = chats || [];

    // Metrics calculation
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Leads Hoje
    const leadsHoje = chatsList.filter(chat => chat.created_at?.startsWith(todayStr)).length;

    // Leads Semana
    const leadsSemana = chatsList.filter(chat => chat.created_at && chat.created_at >= sevenDaysAgo.toISOString()).length;

    // Taxa de Conversão: (Chats ganho / Total) * 100
    const chatsComVenda = chatsList.filter(chat => chat.kanban_status === 'ganho').length;
    const taxaConversao = chatsList.length > 0 ? (chatsComVenda / chatsList.length) * 100 : 0;

    // Giros da Roleta (origem_lead == 'Roleta')
    const girosRoleta = chatsList.filter(chat => chat.origem_lead?.toLowerCase() === 'roleta').length;

    // Mensagens Enviadas (webhook logs success)
    const mensagensEnviadas = webhookStats.successCount;

    // 4. ROI metrics (monetization proof)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const AVERAGE_HUMAN_MINUTES_PER_TURN = 2.5;

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
                        (run) =>
                            typeof run.created_at === "string" &&
                            run.created_at >= sevenDaysIso
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

    // 5. Onboarding status
    const [restaurantRow, automationRow, firstLog, lastWarning] = await Promise.all([
        supabase.from("restaurants").select("uaz_status, store_address, pix_key").eq("id", profile.restaurant_id).single(),
        supabase.from("automations").select("id").eq("restaurant_id", profile.restaurant_id).eq("enabled", true).not("trigger", "is", null).limit(1).maybeSingle(),
        supabase.from("webhook_logs").select("id").eq("restaurant_id", profile.restaurant_id).limit(1).maybeSingle(),
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

    return NextResponse.json({
        ok: true,
        metrics: {
            leadsHoje,
            leadsSemana,
            taxaConversao,
            girosRoleta,
            mensagensEnviadas,
            chatsComVenda,
            totalLeads: chatsList.length
        },
        topProdutos: produtos || [],
        webhookStats,
        roi,
        whatsappHealth,
        onboarding
    }, { status: 200 });
}
