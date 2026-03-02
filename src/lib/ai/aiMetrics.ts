export type AiTurnMetrics = {
    iterationsStarted: number;
    toolAttempts: number;
    toolBlocks: number;
    toolSkips: number;
    toolSuccesses: number;
    payloadSent: number;
    payloadFailures: number;
    textSent: number;
    textFailures: number;
    outboundTextBlocks: number;
    outboundTextSanitizations: number;
    pixPayloadSkips: number;
    finalDeliveryMode: "none" | "text" | "payload";
    lastToolName: string | null;
    processFailed: boolean;
    failureReason: string | null;
};

export type ToolMetricInput = {
    toolName: string;
    blocked: boolean;
    skipped: boolean;
    ok: boolean;
};

export type AiTurnSummary = {
    outcome:
        | "payload_sent"
        | "text_sent"
        | "delivery_failed"
        | "blocked_before_send"
        | "max_iterations_reached"
        | "stopped_without_send"
        | "process_failed";
    sendMode: "none" | "text" | "payload";
    iterationsStarted: number;
    toolAttempts: number;
    toolBlocks: number;
    toolSkips: number;
    toolSuccesses: number;
    payloadSent: number;
    payloadFailures: number;
    textSent: number;
    textFailures: number;
    guardrailInterventions: number;
    totalFailures: number;
    lastToolName: string | null;
    failureReason: string | null;
};

export type AiTurnMetricInsert = {
    restaurant_id: string;
    chat_id: string;
    wa_chat_id: string;
    outcome: AiTurnSummary["outcome"];
    send_mode: AiTurnSummary["sendMode"];
    iterations_started: number;
    tool_attempts: number;
    tool_blocks: number;
    tool_skips: number;
    tool_successes: number;
    payload_sent: number;
    payload_failures: number;
    text_sent: number;
    text_failures: number;
    guardrail_interventions: number;
    total_failures: number;
    last_tool_name: string | null;
    failure_reason: string | null;
};

export function createAiTurnMetrics(): AiTurnMetrics {
    return {
        iterationsStarted: 0,
        toolAttempts: 0,
        toolBlocks: 0,
        toolSkips: 0,
        toolSuccesses: 0,
        payloadSent: 0,
        payloadFailures: 0,
        textSent: 0,
        textFailures: 0,
        outboundTextBlocks: 0,
        outboundTextSanitizations: 0,
        pixPayloadSkips: 0,
        finalDeliveryMode: "none",
        lastToolName: null,
        processFailed: false,
        failureReason: null,
    };
}

export function markIterationStarted(metrics: AiTurnMetrics) {
    metrics.iterationsStarted += 1;
}

export function markToolCompleted(metrics: AiTurnMetrics, input: ToolMetricInput) {
    metrics.toolAttempts += 1;
    metrics.lastToolName = input.toolName;

    if (input.blocked) {
        metrics.toolBlocks += 1;
    }

    if (input.skipped) {
        metrics.toolSkips += 1;
    }

    if (input.ok) {
        metrics.toolSuccesses += 1;
    }
}

export function markPayloadSent(metrics: AiTurnMetrics) {
    metrics.payloadSent += 1;
    metrics.finalDeliveryMode = "payload";
}

export function markPayloadFailed(metrics: AiTurnMetrics) {
    metrics.payloadFailures += 1;
}

export function markTextSent(metrics: AiTurnMetrics) {
    metrics.textSent += 1;
    metrics.finalDeliveryMode = "text";
}

export function markTextFailed(metrics: AiTurnMetrics) {
    metrics.textFailures += 1;
}

export function markOutboundTextBlocked(metrics: AiTurnMetrics) {
    metrics.outboundTextBlocks += 1;
}

export function markOutboundTextSanitized(metrics: AiTurnMetrics) {
    metrics.outboundTextSanitizations += 1;
}

export function markPixPayloadSkipped(metrics: AiTurnMetrics) {
    metrics.pixPayloadSkips += 1;
}

export function markProcessFailure(metrics: AiTurnMetrics, reason: string) {
    metrics.processFailed = true;
    metrics.failureReason = reason;
}

export function buildAiTurnSummary(
    metrics: AiTurnMetrics,
    options: { maxIterationsReached: boolean }
): AiTurnSummary {
    const guardrailInterventions =
        metrics.toolBlocks +
        metrics.outboundTextBlocks +
        metrics.outboundTextSanitizations +
        metrics.pixPayloadSkips;
    const totalFailures =
        metrics.payloadFailures + metrics.textFailures + (metrics.processFailed ? 1 : 0);

    let outcome: AiTurnSummary["outcome"] = "stopped_without_send";
    if (metrics.processFailed) {
        outcome = "process_failed";
    } else if (metrics.finalDeliveryMode === "payload") {
        outcome = "payload_sent";
    } else if (metrics.finalDeliveryMode === "text") {
        outcome = "text_sent";
    } else if (metrics.payloadFailures > 0 || metrics.textFailures > 0) {
        outcome = "delivery_failed";
    } else if (metrics.outboundTextBlocks > 0) {
        outcome = "blocked_before_send";
    } else if (options.maxIterationsReached) {
        outcome = "max_iterations_reached";
    }

    return {
        outcome,
        sendMode: metrics.finalDeliveryMode,
        iterationsStarted: metrics.iterationsStarted,
        toolAttempts: metrics.toolAttempts,
        toolBlocks: metrics.toolBlocks,
        toolSkips: metrics.toolSkips,
        toolSuccesses: metrics.toolSuccesses,
        payloadSent: metrics.payloadSent,
        payloadFailures: metrics.payloadFailures,
        textSent: metrics.textSent,
        textFailures: metrics.textFailures,
        guardrailInterventions,
        totalFailures,
        lastToolName: metrics.lastToolName,
        failureReason: metrics.failureReason,
    };
}

export function buildAiTurnMetricInsert(
    identifiers: {
        restaurantId: string;
        chatId: string;
        waChatId: string;
    },
    summary: AiTurnSummary
): AiTurnMetricInsert {
    return {
        restaurant_id: identifiers.restaurantId,
        chat_id: identifiers.chatId,
        wa_chat_id: identifiers.waChatId,
        outcome: summary.outcome,
        send_mode: summary.sendMode,
        iterations_started: summary.iterationsStarted,
        tool_attempts: summary.toolAttempts,
        tool_blocks: summary.toolBlocks,
        tool_skips: summary.toolSkips,
        tool_successes: summary.toolSuccesses,
        payload_sent: summary.payloadSent,
        payload_failures: summary.payloadFailures,
        text_sent: summary.textSent,
        text_failures: summary.textFailures,
        guardrail_interventions: summary.guardrailInterventions,
        total_failures: summary.totalFailures,
        last_tool_name: summary.lastToolName,
        failure_reason: summary.failureReason,
    };
}
