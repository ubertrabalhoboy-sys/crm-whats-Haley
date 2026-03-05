export type RecoveryRunLike = {
    chat_id: string | null;
    created_at: string | null;
    executed_at?: string | null;
};

export type OrderLike = {
    id: string;
    chat_id: string | null;
    total: number | null;
    created_at: string | null;
};

export type RecoveredSalesSummary = {
    recoveredRevenue: number;
    recoveredOrders: number;
    recoveredChats: number;
    recoveryRuns: number;
    conversionRate: number;
};

type OrderWithTs = OrderLike & { createdAtMs: number };
type RecoveryRunWithTs = RecoveryRunLike & { runAtMs: number };

function toTimestamp(value: string | null | undefined): number | null {
    if (!value) return null;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
}

function toMoney(value: number | null | undefined): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Number(numeric.toFixed(2));
}

export function calculateRecoveredSales(params: {
    runs: RecoveryRunLike[];
    orders: OrderLike[];
    horizonHours?: number;
}): RecoveredSalesSummary {
    const horizonHours = Number.isFinite(Number(params.horizonHours))
        ? Number(params.horizonHours)
        : 24;
    const horizonMs = Math.max(1, horizonHours) * 60 * 60 * 1000;

    const runs = params.runs
        .map<RecoveryRunWithTs | null>((run) => {
            if (!run.chat_id) return null;
            const runAtMs = toTimestamp(run.executed_at ?? run.created_at);
            if (runAtMs === null) return null;
            return { ...run, runAtMs };
        })
        .filter((run): run is RecoveryRunWithTs => run !== null)
        .sort((a, b) => a.runAtMs - b.runAtMs);

    const ordersByChat = new Map<string, OrderWithTs[]>();
    for (const order of params.orders) {
        if (!order.chat_id || !order.id) continue;
        const createdAtMs = toTimestamp(order.created_at);
        if (createdAtMs === null) continue;

        const list = ordersByChat.get(order.chat_id) || [];
        list.push({ ...order, createdAtMs });
        ordersByChat.set(order.chat_id, list);
    }

    for (const [, list] of ordersByChat) {
        list.sort((a, b) => a.createdAtMs - b.createdAtMs);
    }

    const usedOrderIds = new Set<string>();
    const recoveredChats = new Set<string>();
    let recoveredOrders = 0;
    let recoveredRevenue = 0;

    for (const run of runs) {
        const chatOrders = ordersByChat.get(run.chat_id || "");
        if (!chatOrders || chatOrders.length === 0) continue;

        const deadlineMs = run.runAtMs + horizonMs;
        const matchedOrder = chatOrders.find((order) => {
            if (usedOrderIds.has(order.id)) return false;
            if (order.createdAtMs < run.runAtMs) return false;
            return order.createdAtMs <= deadlineMs;
        });

        if (!matchedOrder) continue;

        usedOrderIds.add(matchedOrder.id);
        recoveredChats.add(run.chat_id || "");
        recoveredOrders += 1;
        recoveredRevenue += toMoney(matchedOrder.total);
    }

    const conversionRate = runs.length
        ? Number(((recoveredOrders / runs.length) * 100).toFixed(1))
        : 0;

    return {
        recoveredRevenue: Number(recoveredRevenue.toFixed(2)),
        recoveredOrders,
        recoveredChats: recoveredChats.size,
        recoveryRuns: runs.length,
        conversionRate,
    };
}

export function estimateHumanHoursSaved(
    successfulTurns: number,
    averageMinutesPerTurn = 2.5
): number {
    const validTurns = Math.max(0, Number(successfulTurns) || 0);
    const validMinutes = Math.max(0, Number(averageMinutesPerTurn) || 0);
    return Number(((validTurns * validMinutes) / 60).toFixed(1));
}
