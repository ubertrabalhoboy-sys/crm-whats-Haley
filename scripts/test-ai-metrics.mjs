import assert from "node:assert/strict";
import {
    buildAiTurnMetricInsert,
    buildAiTurnSummary,
    createAiTurnMetrics,
    markIterationStarted,
    markOutboundTextBlocked,
    markOutboundTextSanitized,
    markPayloadFailed,
    markPayloadSent,
    markPixPayloadSkipped,
    markProcessFailure,
    markTextFailed,
    markTextSent,
    markToolCompleted,
} from "../src/lib/ai/aiMetrics.ts";

const payloadMetrics = createAiTurnMetrics();
markIterationStarted(payloadMetrics);
markToolCompleted(payloadMetrics, {
    toolName: "send_uaz_carousel",
    blocked: false,
    skipped: false,
    ok: true,
});
markPayloadSent(payloadMetrics);

assert.deepEqual(
    buildAiTurnSummary(payloadMetrics, { maxIterationsReached: false }),
    {
        outcome: "payload_sent",
        sendMode: "payload",
        iterationsStarted: 1,
        toolAttempts: 1,
        toolBlocks: 0,
        toolSkips: 0,
        toolSuccesses: 1,
        payloadSent: 1,
        payloadFailures: 0,
        textSent: 0,
        textFailures: 0,
        guardrailInterventions: 0,
        totalFailures: 0,
        lastToolName: "send_uaz_carousel",
        failureReason: null,
    }
);

const guardedMetrics = createAiTurnMetrics();
markIterationStarted(guardedMetrics);
markToolCompleted(guardedMetrics, {
    toolName: "submit_final_order",
    blocked: true,
    skipped: true,
    ok: true,
});
markPixPayloadSkipped(guardedMetrics);
markOutboundTextSanitized(guardedMetrics);
markOutboundTextBlocked(guardedMetrics);

assert.deepEqual(
    buildAiTurnSummary(guardedMetrics, { maxIterationsReached: false }),
    {
        outcome: "blocked_before_send",
        sendMode: "none",
        iterationsStarted: 1,
        toolAttempts: 1,
        toolBlocks: 1,
        toolSkips: 1,
        toolSuccesses: 1,
        payloadSent: 0,
        payloadFailures: 0,
        textSent: 0,
        textFailures: 0,
        guardrailInterventions: 4,
        totalFailures: 0,
        lastToolName: "submit_final_order",
        failureReason: null,
    }
);

const failedMetrics = createAiTurnMetrics();
markIterationStarted(failedMetrics);
markTextFailed(failedMetrics);
markPayloadFailed(failedMetrics);
markProcessFailure(failedMetrics, "GEMINI_REQUEST_TIMEOUT");

assert.deepEqual(
    buildAiTurnSummary(failedMetrics, { maxIterationsReached: false }),
    {
        outcome: "process_failed",
        sendMode: "none",
        iterationsStarted: 1,
        toolAttempts: 0,
        toolBlocks: 0,
        toolSkips: 0,
        toolSuccesses: 0,
        payloadSent: 0,
        payloadFailures: 1,
        textSent: 0,
        textFailures: 1,
        guardrailInterventions: 0,
        totalFailures: 3,
        lastToolName: null,
        failureReason: "GEMINI_REQUEST_TIMEOUT",
    }
);

const textMetrics = createAiTurnMetrics();
markIterationStarted(textMetrics);
markTextSent(textMetrics);

assert.deepEqual(
    buildAiTurnSummary(textMetrics, { maxIterationsReached: false }),
    {
        outcome: "text_sent",
        sendMode: "text",
        iterationsStarted: 1,
        toolAttempts: 0,
        toolBlocks: 0,
        toolSkips: 0,
        toolSuccesses: 0,
        payloadSent: 0,
        payloadFailures: 0,
        textSent: 1,
        textFailures: 0,
        guardrailInterventions: 0,
        totalFailures: 0,
        lastToolName: null,
        failureReason: null,
    }
);

assert.deepEqual(
    buildAiTurnSummary(createAiTurnMetrics(), { maxIterationsReached: true }),
    {
        outcome: "max_iterations_reached",
        sendMode: "none",
        iterationsStarted: 0,
        toolAttempts: 0,
        toolBlocks: 0,
        toolSkips: 0,
        toolSuccesses: 0,
        payloadSent: 0,
        payloadFailures: 0,
        textSent: 0,
        textFailures: 0,
        guardrailInterventions: 0,
        totalFailures: 0,
        lastToolName: null,
        failureReason: null,
    }
);

assert.deepEqual(
    buildAiTurnMetricInsert(
        {
            restaurantId: "rest-1",
            chatId: "chat-1",
            waChatId: "5511999999999@c.us",
        },
        buildAiTurnSummary(payloadMetrics, { maxIterationsReached: false })
    ),
    {
        restaurant_id: "rest-1",
        chat_id: "chat-1",
        wa_chat_id: "5511999999999@c.us",
        outcome: "payload_sent",
        send_mode: "payload",
        iterations_started: 1,
        tool_attempts: 1,
        tool_blocks: 0,
        tool_skips: 0,
        tool_successes: 1,
        payload_sent: 1,
        payload_failures: 0,
        text_sent: 0,
        text_failures: 0,
        guardrail_interventions: 0,
        total_failures: 0,
        last_tool_name: "send_uaz_carousel",
        failure_reason: null,
    }
);

console.log("AI metrics smoke tests passed");
