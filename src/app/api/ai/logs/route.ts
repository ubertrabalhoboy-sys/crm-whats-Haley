import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AiLogRow = {
    created_at: string | null;
    chat_id: string | null;
    wa_chat_id: string | null;
    model: string | null;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    duration_ms: number | null;
};

type AiTurnMetricRow = {
    created_at: string | null;
    chat_id: string | null;
    outcome: string | null;
    send_mode: string | null;
    iterations_started: number | null;
    tool_attempts: number | null;
    tool_successes: number | null;
    tool_blocks: number | null;
    guardrail_interventions: number | null;
    total_failures: number | null;
    last_tool_name: string | null;
    failure_reason: string | null;
};

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function percent(numerator: number, denominator: number) {
    if (!denominator) return 0;
    return Number(((numerator / denominator) * 100).toFixed(1));
}

function estimateAiCostUsd(logs: AiLogRow[]) {
    return logs.reduce((sum, row) => {
        const model = String(row.model || "").toLowerCase();
        const promptTokens = toNumber(row.prompt_tokens);
        const completionTokens = toNumber(row.completion_tokens);
        const isOpenAiMini = model.includes("gpt-4o-mini");
        const inputRatePerMillion = isOpenAiMini ? 0.15 : 0.3;
        const outputRatePerMillion = isOpenAiMini ? 0.6 : 2.5;

        return (
            sum +
            (promptTokens / 1_000_000) * inputRatePerMillion +
            (completionTokens / 1_000_000) * outputRatePerMillion
        );
    }, 0);
}

export async function GET(req: NextRequest) {
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

    const windowMinutes = clamp(
        Number.parseInt(req.nextUrl.searchParams.get("window") || "1440", 10) || 1440,
        15,
        10080
    );
    const limit = clamp(
        Number.parseInt(req.nextUrl.searchParams.get("limit") || "80", 10) || 80,
        20,
        200
    );
    const windowStartIso = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    const [logsResult, turnsResult] = await Promise.all([
        supabase
            .from("ai_logs")
            .select(
                "created_at, chat_id, wa_chat_id, model, prompt_tokens, completion_tokens, total_tokens, duration_ms"
            )
            .eq("restaurant_id", profile.restaurant_id)
            .gte("created_at", windowStartIso)
            .order("created_at", { ascending: false })
            .limit(Math.max(limit * 2, 120)),
        supabase
            .from("ai_turn_metrics")
            .select(
                "created_at, chat_id, outcome, send_mode, iterations_started, tool_attempts, tool_successes, tool_blocks, guardrail_interventions, total_failures, last_tool_name, failure_reason"
            )
            .eq("restaurant_id", profile.restaurant_id)
            .gte("created_at", windowStartIso)
            .order("created_at", { ascending: false })
            .limit(Math.max(limit * 2, 120)),
    ]);

    if (logsResult.error) {
        return NextResponse.json({ ok: false, error: logsResult.error.message }, { status: 500 });
    }
    if (turnsResult.error) {
        return NextResponse.json({ ok: false, error: turnsResult.error.message }, { status: 500 });
    }

    const logs = (logsResult.data || []) as AiLogRow[];
    const turns = (turnsResult.data || []) as AiTurnMetricRow[];

    const totalPromptTokens = logs.reduce((sum, row) => sum + toNumber(row.prompt_tokens), 0);
    const totalCompletionTokens = logs.reduce(
        (sum, row) => sum + toNumber(row.completion_tokens),
        0
    );
    const totalTokens = logs.reduce((sum, row) => sum + toNumber(row.total_tokens), 0);
    const durations = logs
        .map((row) => toNumber(row.duration_ms))
        .filter((value) => value > 0)
        .sort((a, b) => a - b);
    const avgLatencyMs = durations.length
        ? Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1))
        : 0;
    const p95LatencyMs = durations.length
        ? durations[Math.max(0, Math.floor(durations.length * 0.95) - 1)]
        : 0;

    const turnsTotal = turns.length;
    const successfulTurns = turns.filter(
        (row) => row.outcome === "payload_sent" || row.outcome === "text_sent"
    ).length;
    const failedTurns = turns.filter((row) =>
        [
            "delivery_failed",
            "process_failed",
            "max_iterations_reached",
            "stopped_without_send",
        ].includes(String(row.outcome || ""))
    ).length;
    const blockedTurns = turns.filter(
        (row) => row.outcome === "blocked_before_send" || toNumber(row.tool_blocks) > 0
    ).length;
    const guardrailTurns = turns.filter(
        (row) => toNumber(row.guardrail_interventions) > 0
    ).length;

    return NextResponse.json({
        ok: true,
        windowMinutes,
        summary: {
            llmCalls: logs.length,
            totalPromptTokens,
            totalCompletionTokens,
            totalTokens,
            avgLatencyMs,
            p95LatencyMs,
            estimatedCostUsd: Number(estimateAiCostUsd(logs).toFixed(4)),
            turnsTotal,
            successfulTurns,
            failedTurns,
            blockedTurns,
            guardrailTurns,
            successRate: percent(successfulTurns, turnsTotal),
            failureRate: percent(failedTurns, turnsTotal),
            blockRate: percent(blockedTurns, turnsTotal),
            guardrailRate: percent(guardrailTurns, turnsTotal),
        },
        recentLogs: logs.slice(0, limit),
        recentTurns: turns.slice(0, limit),
        lastUpdatedAt: new Date().toISOString(),
    });
}

