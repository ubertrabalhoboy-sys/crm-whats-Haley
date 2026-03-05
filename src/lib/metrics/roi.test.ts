import { describe, expect, it } from "vitest";
import { calculateRecoveredSales, estimateHumanHoursSaved } from "./roi";

describe("ROI metrics", () => {
    it("counts recovered revenue when an order is created after recovery run", () => {
        const runs = [
            {
                chat_id: "chat-1",
                created_at: "2026-03-05T10:00:00.000Z",
                executed_at: "2026-03-05T10:01:00.000Z",
            },
        ];
        const orders = [
            {
                id: "order-1",
                chat_id: "chat-1",
                total: 89.9,
                created_at: "2026-03-05T10:20:00.000Z",
            },
        ];

        const result = calculateRecoveredSales({ runs, orders, horizonHours: 24 });
        expect(result.recoveredRevenue).toBe(89.9);
        expect(result.recoveredOrders).toBe(1);
        expect(result.recoveryRuns).toBe(1);
        expect(result.conversionRate).toBe(100);
    });

    it("ignores orders outside the attribution window", () => {
        const runs = [
            {
                chat_id: "chat-1",
                created_at: "2026-03-05T10:00:00.000Z",
                executed_at: "2026-03-05T10:00:00.000Z",
            },
        ];
        const orders = [
            {
                id: "order-1",
                chat_id: "chat-1",
                total: 120,
                created_at: "2026-03-07T11:00:00.000Z",
            },
        ];

        const result = calculateRecoveredSales({ runs, orders, horizonHours: 24 });
        expect(result.recoveredRevenue).toBe(0);
        expect(result.recoveredOrders).toBe(0);
        expect(result.conversionRate).toBe(0);
    });

    it("does not double count the same order for duplicated runs", () => {
        const runs = [
            {
                chat_id: "chat-1",
                created_at: "2026-03-05T10:00:00.000Z",
                executed_at: "2026-03-05T10:00:00.000Z",
            },
            {
                chat_id: "chat-1",
                created_at: "2026-03-05T10:05:00.000Z",
                executed_at: "2026-03-05T10:05:00.000Z",
            },
        ];
        const orders = [
            {
                id: "order-1",
                chat_id: "chat-1",
                total: 45.5,
                created_at: "2026-03-05T10:10:00.000Z",
            },
        ];

        const result = calculateRecoveredSales({ runs, orders, horizonHours: 24 });
        expect(result.recoveredRevenue).toBe(45.5);
        expect(result.recoveredOrders).toBe(1);
        expect(result.recoveryRuns).toBe(2);
        expect(result.conversionRate).toBe(50);
    });

    it("estimates saved human hours with configurable average time", () => {
        expect(estimateHumanHoursSaved(120, 2.5)).toBe(5);
        expect(estimateHumanHoursSaved(0, 2.5)).toBe(0);
    });
});
