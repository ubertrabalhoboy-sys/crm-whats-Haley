import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TurnMetricRow = {
    created_at: string | null;
    outcome: string | null;
    send_mode: string | null;
    tool_blocks: number | null;
    tool_attempts: number | null;
    tool_successes: number | null;
    tool_skips: number | null;
    guardrail_interventions: number | null;
    total_failures: number | null;
    iterations_started: number | null;
    last_tool_name: string | null;
    failure_reason: string | null;
};

function percent(value: number, total: number) {
    if (!total) return 0;
    return Number(((value / total) * 100).toFixed(1));
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

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
        .from("ai_turn_metrics")
        .select(
            "created_at, outcome, send_mode, tool_blocks, tool_attempts, tool_successes, tool_skips, guardrail_interventions, total_failures, iterations_started, last_tool_name, failure_reason"
        )
        .eq("restaurant_id", profile.restaurant_id)
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(200);

    if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = ((data || []) as TurnMetricRow[]).map((row) => ({
        created_at: row.created_at,
        outcome: row.outcome || "unknown",
        send_mode: row.send_mode || "none",
        tool_blocks: row.tool_blocks || 0,
        tool_attempts: row.tool_attempts || 0,
        tool_successes: row.tool_successes || 0,
        tool_skips: row.tool_skips || 0,
        guardrail_interventions: row.guardrail_interventions || 0,
        total_failures: row.total_failures || 0,
        iterations_started: row.iterations_started || 0,
        last_tool_name: row.last_tool_name,
        failure_reason: row.failure_reason,
    }));

    const turnsTotal = rows.length;
    const successfulTurns = rows.filter((row) =>
        row.outcome === "payload_sent" || row.outcome === "text_sent"
    ).length;
    const hardFailedTurns = rows.filter((row) =>
        row.outcome === "delivery_failed" ||
        row.outcome === "process_failed" ||
        row.outcome === "max_iterations_reached" ||
        row.outcome === "stopped_without_send"
    ).length;
    const blockedTurns = rows.filter(
        (row) => row.outcome === "blocked_before_send" || row.tool_blocks > 0
    ).length;
    const guardrailTurns = rows.filter((row) => row.guardrail_interventions > 0).length;
    const recoveredIssueTurns = rows.filter(
        (row) =>
            (row.outcome === "payload_sent" || row.outcome === "text_sent") &&
            row.total_failures > 0
    ).length;
    const payloadTurns = rows.filter((row) => row.send_mode === "payload").length;
    const textTurns = rows.filter((row) => row.send_mode === "text").length;
    const avgIterations = turnsTotal
        ? Number(
              (
                  rows.reduce((sum, row) => sum + row.iterations_started, 0) / turnsTotal
              ).toFixed(1)
          )
        : 0;

    const outcomeBreakdown = [
        "payload_sent",
        "text_sent",
        "blocked_before_send",
        "delivery_failed",
        "max_iterations_reached",
        "stopped_without_send",
        "process_failed",
    ].map((outcome) => ({
        outcome,
        count: rows.filter((row) => row.outcome === outcome).length,
    }));

    return NextResponse.json({
        ok: true,
        summary: {
            turnsTotal,
            successfulTurns,
            blockedTurns,
            guardrailTurns,
            failedTurns: hardFailedTurns,
            recoveredIssueTurns,
            payloadTurns,
            textTurns,
            avgIterations,
            successRate: percent(successfulTurns, turnsTotal),
            blockRate: percent(blockedTurns, turnsTotal),
            guardrailRate: percent(guardrailTurns, turnsTotal),
            failureRate: percent(hardFailedTurns, turnsTotal),
            recoveredIssueRate: percent(recoveredIssueTurns, turnsTotal),
        },
        outcomeBreakdown,
        recentTurns: rows.slice(0, 12),
    });
}
