import { supabaseServer } from "@/lib/supabaseServer";
import { matchesOnlyIf } from "@/lib/automations/filters";

type AutomationContext = Record<string, unknown>;

type RunParams = {
  restaurant_id: string;
  chat_id: string;
  trigger: string;
  fingerprint: string;
  context?: AutomationContext;
};

function isUniqueViolation(error: unknown) {
  const err = error as { code?: string; message?: string } | null;
  const message = String(err?.message || "").toLowerCase();
  return (
    err?.code === "23505" ||
    message.includes("duplicate key value violates unique constraint") ||
    message.includes("duplicate key")
  );
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function guessNumberFromChatId(waChatId: string | null) {
  if (!waChatId) return null;
  return waChatId.split("@")[0] ?? null;
}

function renderTemplate(template: string, context: AutomationContext) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const value = context[key];
    if (value === undefined || value === null) return "";
    return typeof value === "string" ? value : String(value);
  });
}

async function sendTextForChat(params: {
  restaurant_id: string;
  chat_id: string;
  text: string;
}) {
  const { restaurant_id, chat_id, text } = params;

  const { data: chat, error: chatError } = await supabaseServer
    .from("chats")
    .select("id, wa_chat_id, contacts(phone)")
    .eq("id", chat_id)
    .eq("restaurant_id", restaurant_id)
    .single();

  if (chatError || !chat) {
    throw new Error(chatError?.message || "chat_not_found");
  }

  const base = process.env.UAZAPI_BASE_URL;
  const token = process.env.UAZAPI_TOKEN;
  if (!base || !token) {
    throw new Error("UAZAPI_NOT_CONFIGURED");
  }

  const rawNumber =
    (chat as any)?.contacts?.phone ||
    guessNumberFromChatId((chat as any)?.wa_chat_id ?? null) ||
    "";
  const number = String(rawNumber).replace(/\D/g, "");

  if (!number) {
    throw new Error("MISSING_CHAT_NUMBER");
  }

  const uazRes = await fetch(`${normalizeBaseUrl(base)}/send/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token,
    },
    body: JSON.stringify({ number, text }),
  });

  const raw = await uazRes.text();
  let uazJson: any = null;
  try {
    uazJson = JSON.parse(raw);
  } catch {
    uazJson = raw;
  }

  if (!uazRes.ok) {
    throw new Error(`UAZ_SEND_FAILED:${typeof uazJson === "string" ? uazJson : JSON.stringify(uazJson)}`);
  }

  const wa_message_id = (uazJson as any)?.id || (uazJson as any)?.messageId || null;

  const { error: insertError } = await supabaseServer.from("messages").insert({
    chat_id,
    restaurant_id,
    direction: "out",
    wa_message_id,
    text,
    payload: uazJson,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  await supabaseServer
    .from("chats")
    .update({ last_message: text, updated_at: new Date().toISOString() })
    .eq("id", chat_id)
    .eq("restaurant_id", restaurant_id);
}

export async function runAutomations(params: RunParams) {
  const now = new Date().toISOString();
  const context: AutomationContext = params.context ?? {};

  const { data: run, error: runInsertError } = await supabaseServer
    .from("automation_runs")
    .insert({
      restaurant_id: params.restaurant_id,
      chat_id: params.chat_id,
      trigger: params.trigger,
      fingerprint: params.fingerprint,
      status: "queued",
      context,
      created_at: now,
    })
    .select("id")
    .single();

  if (runInsertError || !run?.id) {
    if (isUniqueViolation(runInsertError)) {
      return { ok: true, status: "skipped", reason: "duplicate_fingerprint" };
    }
    return { ok: false, error: runInsertError?.message || "automation_run_insert_failed" };
  }

  const runId = run.id as string;

  const { data: duplicateRuns, error: duplicateError } = await supabaseServer
    .from("automation_runs")
    .select("id")
    .eq("restaurant_id", params.restaurant_id)
    .eq("fingerprint", params.fingerprint)
    .in("status", ["queued", "running", "success"])
    .neq("id", runId)
    .limit(1);

  if (duplicateError) {
    await supabaseServer
      .from("automation_runs")
      .update({ status: "failed", error: duplicateError.message, executed_at: new Date().toISOString() })
      .eq("id", runId);
    return { ok: false, error: duplicateError.message, run_id: runId };
  }

  if (duplicateRuns && duplicateRuns.length > 0) {
    await supabaseServer
      .from("automation_runs")
      .update({ status: "skipped", error: "IDEMPOTENT_DUPLICATE", executed_at: new Date().toISOString() })
      .eq("id", runId);
    return { ok: true, skipped: true, run_id: runId };
  }

  await supabaseServer
    .from("automation_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", runId);

  let currentStageId: string | null = null;
  if (params.trigger === "button_clicked") {
    const { data: chatStageRow, error: chatStageError } = await supabaseServer
      .from("chats")
      .select("kanban_status")
      .eq("id", params.chat_id)
      .eq("restaurant_id", params.restaurant_id)
      .maybeSingle();

    if (chatStageError) {
      await supabaseServer
        .from("automation_runs")
        .update({
          status: "failed",
          error: chatStageError.message,
          finished_at: new Date().toISOString(),
          executed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return { ok: false, error: chatStageError.message, run_id: runId };
    }

    const currentStageName =
      typeof (chatStageRow as any)?.kanban_status === "string"
        ? (chatStageRow as any).kanban_status.trim()
        : "";

    if (!currentStageName) {
      await supabaseServer
        .from("automation_runs")
        .update({
          status: "skipped",
          error: "NO_CHAT_STAGE",
          finished_at: new Date().toISOString(),
          executed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return { ok: true, run_id: runId, status: "skipped", reason: "no_chat_stage" };
    }

    const { data: currentStage, error: currentStageError } = await supabaseServer
      .from("kanban_stages")
      .select("id")
      .eq("restaurant_id", params.restaurant_id)
      .eq("name", currentStageName)
      .maybeSingle();

    if (currentStageError) {
      await supabaseServer
        .from("automation_runs")
        .update({
          status: "failed",
          error: currentStageError.message,
          finished_at: new Date().toISOString(),
          executed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return { ok: false, error: currentStageError.message, run_id: runId };
    }

    if (!(currentStage as any)?.id) {
      await supabaseServer
        .from("automation_runs")
        .update({
          status: "skipped",
          error: "UNKNOWN_CHAT_STAGE",
          finished_at: new Date().toISOString(),
          executed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return { ok: true, run_id: runId, status: "skipped", reason: "unknown_chat_stage" };
    }

    currentStageId = String((currentStage as any).id);
  }

  let automationsQuery = supabaseServer
    .from("automations")
    .select(
      "id, restaurant_id, stage_id, trigger, enabled, action_type, template_text, delay_seconds, cooldown_seconds, only_if, run_once_per_chat"
    )
    .eq("restaurant_id", params.restaurant_id)
    .eq("enabled", true)
    .eq("trigger", params.trigger);

  if (params.trigger === "button_clicked" && currentStageId) {
    automationsQuery = automationsQuery.eq("stage_id", currentStageId);
  }

  const { data: automations, error: automationsError } = await automationsQuery;

  if (automationsError) {
    await supabaseServer
      .from("automation_runs")
      .update({ status: "failed", error: automationsError.message, executed_at: new Date().toISOString() })
      .eq("id", runId);
    return { ok: false, error: automationsError.message, run_id: runId };
  }

  let sentCount = 0;
  let failedCount = 0;
  let firstExecutedAutomationId: string | null = null;

  for (const automation of automations ?? []) {
    const onlyIfRaw = (automation as any).only_if;
    const onlyIfForMatch =
      onlyIfRaw && typeof onlyIfRaw === "object" && !Array.isArray(onlyIfRaw)
        ? Object.fromEntries(
            Object.entries(onlyIfRaw as Record<string, unknown>).filter(
              ([key]) => key !== "template_id" && key !== "to_stage_id"
            )
          )
        : onlyIfRaw;

    if (!matchesOnlyIf(onlyIfForMatch, context)) continue;

    if (!firstExecutedAutomationId && (automation as any)?.id) {
      firstExecutedAutomationId = String((automation as any).id);
      const { error: runBindError } = await supabaseServer
        .from("automation_runs")
        .update({ automation_id: firstExecutedAutomationId })
        .eq("id", runId);
      if (runBindError) {
        await supabaseServer
          .from("automation_runs")
          .update({
            status: "failed",
            error: runBindError.message,
            finished_at: new Date().toISOString(),
            executed_at: new Date().toISOString(),
          })
          .eq("id", runId);
        return { ok: false, error: runBindError.message, run_id: runId };
      }
    }

    if ((automation as any).run_once_per_chat) {
      const { error: lockError } = await supabaseServer.from("automation_run_locks").insert({
        restaurant_id: params.restaurant_id,
        automation_id: (automation as any).id,
        chat_id: params.chat_id,
      });
      if (lockError) {
        if (isUniqueViolation(lockError)) {
          await supabaseServer
            .from("automation_runs")
            .update({
              status: "skipped",
              error: "RUN_ONCE_LOCK",
              finished_at: new Date().toISOString(),
              executed_at: new Date().toISOString(),
            })
            .eq("id", runId);
          return { ok: true, run_id: runId, status: "skipped", reason: "run_once_lock" };
        }
        failedCount += 1;
        continue;
      }
    }

    if ((automation as any).action_type === "move_stage") {
      try {
        const delaySeconds = Number((automation as any).delay_seconds ?? 0);
        if (Number.isFinite(delaySeconds) && delaySeconds > 0) {
          await sleep(delaySeconds * 1000);
        }

        const toStageId =
          onlyIfRaw && typeof onlyIfRaw === "object" && !Array.isArray(onlyIfRaw)
            ? ((onlyIfRaw as Record<string, unknown>).to_stage_id as string | undefined)
            : undefined;

        if (!toStageId) {
          failedCount += 1;
          continue;
        }

        const { data: targetStage, error: targetStageError } = await supabaseServer
          .from("kanban_stages")
          .select("id, name")
          .eq("restaurant_id", params.restaurant_id)
          .eq("id", toStageId)
          .maybeSingle();

        const targetStageName =
          typeof (targetStage as any)?.name === "string" ? (targetStage as any).name : null;

        if (targetStageError || !targetStageName) {
          failedCount += 1;
          continue;
        }

        const { error: moveError } = await supabaseServer
          .from("chats")
          .update({ kanban_status: targetStageName, updated_at: new Date().toISOString() })
          .eq("id", params.chat_id)
          .eq("restaurant_id", params.restaurant_id);

        if (moveError) {
          failedCount += 1;
          continue;
        }

        sentCount += 1;
      } catch {
        failedCount += 1;
      }
      continue;
    }

    if ((automation as any).action_type !== "send_template") continue;

    try {
      const delaySeconds = Number((automation as any).delay_seconds ?? 0);
      if (Number.isFinite(delaySeconds) && delaySeconds > 0) {
        await sleep(delaySeconds * 1000);
      }

      let templateText = ((automation as any).template_text as string | null) ?? null;

      if (!templateText || !templateText.trim()) {
        const templateId =
          onlyIfRaw && typeof onlyIfRaw === "object" && !Array.isArray(onlyIfRaw)
            ? ((onlyIfRaw as Record<string, unknown>).template_id as string | undefined)
            : undefined;

        if (templateId) {
          const { data: template } = await supabaseServer
            .from("message_templates")
            .select("id, content, is_active")
            .eq("id", templateId)
            .eq("restaurant_id", params.restaurant_id)
            .eq("is_active", true)
            .maybeSingle();
          templateText = (template as any)?.content ?? null;
        }
      }

      if (!templateText || !templateText.trim()) {
        failedCount += 1;
        continue;
      }

      const text = renderTemplate(templateText, context);
      if (!text.trim()) {
        failedCount += 1;
        continue;
      }

      await sendTextForChat({
        restaurant_id: params.restaurant_id,
        chat_id: params.chat_id,
        text,
      });
      sentCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  const finalStatus = failedCount > 0 && sentCount === 0 ? "failed" : "success";
  const finalError = failedCount > 0 && sentCount === 0 ? "AUTOMATION_ACTIONS_FAILED" : null;

  await supabaseServer
    .from("automation_runs")
    .update({
      status: finalStatus,
      error: finalError,
      finished_at: new Date().toISOString(),
      executed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  return {
    ok: true,
    run_id: runId,
    status: finalStatus,
    sent: sentCount,
    failed: failedCount,
  };
}
