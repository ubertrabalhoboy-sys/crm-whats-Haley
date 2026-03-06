import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateRecoveredSales, estimateHumanHoursSaved } from "@/lib/metrics/roi";
import { buildSimplePdf } from "@/lib/pdf/simple-pdf";

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

function formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(Number.isFinite(value) ? value : 0);
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

    const restaurantId = profile.restaurant_id;

    const { data: restaurant } = await supabase
        .from("restaurants")
        .select("name")
        .eq("id", restaurantId)
        .maybeSingle();

    const restaurantName = restaurant?.name || "Restaurante";
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const AVERAGE_HUMAN_MINUTES_PER_TURN = 2.5;

    let recoveredSales7d = 0;
    let recoveredOrders7d = 0;
    let recoveryRuns7d = 0;
    let recoveryConversionRate7d = 0;
    let recoveredSalesMonth = 0;
    let recoveredOrdersMonth = 0;
    let recoveryRunsMonth = 0;
    let recoveryConversionRateMonth = 0;
    let successfulAiTurnsMonth = 0;

    const { data: automationRuns, error: automationRunsError } = await supabase
        .from("automation_runs")
        .select("chat_id, created_at, executed_at, status, trigger")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);

    if (!automationRunsError) {
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

                const { data: orders, error: ordersError } = await supabase
                    .from("orders")
                    .select("id, chat_id, total, created_at")
                    .eq("restaurant_id", restaurantId)
                    .in("chat_id", chatIds)
                    .gte("created_at", new Date(earliestRunMs).toISOString())
                    .order("created_at", { ascending: true })
                    .limit(2000);

                if (!ordersError) {
                    const typedOrders = (orders || []) as OrderRow[];
                    const runs7d = successfulRecoveryRuns.filter(
                        (run) =>
                            typeof run.created_at === "string" &&
                            run.created_at >= sevenDaysAgo.toISOString()
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

                    recoveredSales7d = summary7d.recoveredRevenue;
                    recoveredOrders7d = summary7d.recoveredOrders;
                    recoveryRuns7d = summary7d.recoveryRuns;
                    recoveryConversionRate7d = summary7d.conversionRate;
                    recoveredSalesMonth = summaryMonth.recoveredRevenue;
                    recoveredOrdersMonth = summaryMonth.recoveredOrders;
                    recoveryRunsMonth = summaryMonth.recoveryRuns;
                    recoveryConversionRateMonth = summaryMonth.conversionRate;
                }
            }
        }
    }

    const { data: aiTurns, error: aiTurnsError } = await supabase
        .from("ai_turn_metrics")
        .select("outcome")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .limit(5000);

    if (!aiTurnsError) {
        successfulAiTurnsMonth = ((aiTurns || []) as AiTurnOutcomeRow[]).filter(
            (row) => row.outcome === "text_sent" || row.outcome === "payload_sent"
        ).length;
    }

    const estimatedHoursSavedMonth = estimateHumanHoursSaved(
        successfulAiTurnsMonth,
        AVERAGE_HUMAN_MINUTES_PER_TURN
    );

    const generatedAt = now.toLocaleString("pt-BR");
    const lines = [
        `Relatorio ROI Haley - ${restaurantName}`,
        `Gerado em: ${generatedAt}`,
        "",
        "Resumo 7 dias",
        `Receita recuperada: ${formatCurrency(recoveredSales7d)}`,
        `Pedidos recuperados: ${recoveredOrders7d}`,
        `Tentativas de recuperacao: ${recoveryRuns7d}`,
        `Taxa de conversao: ${recoveryConversionRate7d.toFixed(1)}%`,
        "",
        "Resumo 30 dias",
        `Receita recuperada: ${formatCurrency(recoveredSalesMonth)}`,
        `Pedidos recuperados: ${recoveredOrdersMonth}`,
        `Tentativas de recuperacao: ${recoveryRunsMonth}`,
        `Taxa de conversao: ${recoveryConversionRateMonth.toFixed(1)}%`,
        "",
        "Produtividade IA",
        `Turnos bem sucedidos: ${successfulAiTurnsMonth}`,
        `Tempo humano economizado: ${estimatedHoursSavedMonth.toFixed(1)} horas`,
        `Media assumida por turno: ${AVERAGE_HUMAN_MINUTES_PER_TURN.toFixed(1)} min`,
    ];

    const pdfBytes = buildSimplePdf(lines);
    const pdfBuffer = Buffer.from(pdfBytes);
    const filenameDate = now.toISOString().slice(0, 10);
    const filename = `roi-haley-${filenameDate}.pdf`;

    return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename=\"${filename}\"`,
            "Cache-Control": "no-store",
        },
    });
}
