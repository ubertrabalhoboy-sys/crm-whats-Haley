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

  let automationsQuery = supabaseServer
    .from("automations")
    .select(
      "id, restaurant_id, stage_id, trigger, enabled, action_type, template_text, delay_seconds, cooldown_seconds, only_if, run_once_per_chat"
    )
    .eq("restaurant_id", params.restaurant_id)
    .eq("enabled", true)
    .eq("trigger", params.trigger);

  const { data: automations, error: automationsError } = await automationsQuery;

  if (automationsError) {
    return { ok: false, error: automationsError.message };
  }

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let firstRunId: string | null = null;
  let matchedAny = false;

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

    const onlyIfButtonId =
      onlyIfRaw && typeof onlyIfRaw === "object" && !Array.isArray(onlyIfRaw)
        ? (onlyIfRaw as Record<string, unknown>).buttonId
        : undefined;

    if (params.trigger === "button_clicked") {
      if (typeof onlyIfButtonId !== "string" || !onlyIfButtonId.trim()) continue;
    }

    if (!matchesOnlyIf(onlyIfForMatch, context)) continue;
    matchedAny = true;
    const automationId = String((automation as any).id);
    const runFingerprint = `${params.fingerprint}:${automationId}`;

    const { data: run, error: runInsertError } = await supabaseServer
      .from("automation_runs")
      .insert({
        restaurant_id: params.restaurant_id,
        automation_id: automationId,
        chat_id: params.chat_id,
        trigger: params.trigger,
        fingerprint: runFingerprint,
        status: "queued",
        context,
        created_at: now,
      })
      .select("id")
      .single();

    if (runInsertError || !run?.id) {
      if (isUniqueViolation(runInsertError)) {
        skippedCount += 1;
        continue;
      }
      return { ok: false, error: runInsertError?.message || "automation_run_insert_failed" };
    }

    const runId = String(run.id);
    if (!firstRunId) firstRunId = runId;

    const { data: duplicateRuns, error: duplicateError } = await supabaseServer
      .from("automation_runs")
      .select("id")
      .eq("restaurant_id", params.restaurant_id)
      .eq("fingerprint", runFingerprint)
      .in("status", ["queued", "running", "success"])
      .neq("id", runId)
      .limit(1);

    if (duplicateError) {
      await supabaseServer
        .from("automation_runs")
        .update({
          status: "failed",
          error: duplicateError.message,
          finished_at: new Date().toISOString(),
          executed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return { ok: false, error: duplicateError.message, run_id: runId };
    }

    if (duplicateRuns && duplicateRuns.length > 0) {
      skippedCount += 1;
      await supabaseServer
        .from("automation_runs")
        .update({
          status: "skipped",
          error: "IDEMPOTENT_DUPLICATE",
          finished_at: new Date().toISOString(),
          executed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      continue;
    }

    await supabaseServer
      .from("automation_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", runId);

    let runSent = 0;
    let runFailed = 0;
    let runStatus: "success" | "failed" | "skipped" = "success";
    let runError: string | null = null;

    if ((automation as any).run_once_per_chat) {
      const { error: lockError } = await supabaseServer.from("automation_run_locks").insert({
        restaurant_id: params.restaurant_id,
        automation_id: (automation as any).id,
        chat_id: params.chat_id,
      });
      if (lockError) {
        if (isUniqueViolation(lockError)) {
          skippedCount += 1;
          await supabaseServer
            .from("automation_runs")
            .update({
              status: "skipped",
              error: "RUN_ONCE_LOCK",
              finished_at: new Date().toISOString(),
              executed_at: new Date().toISOString(),
            })
            .eq("id", runId);
          continue;
        }
        runFailed += 1;
        failedCount += 1;
        runStatus = "failed";
        runError = lockError.message ?? "RUN_LOCK_ERROR";
        await supabaseServer
          .from("automation_runs")
          .update({
            status: runStatus,
            error: runError,
            finished_at: new Date().toISOString(),
            executed_at: new Date().toISOString(),
          })
          .eq("id", runId);
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
          runFailed += 1;
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
          runFailed += 1;
          failedCount += 1;
          continue;
        }

        const { error: moveError } = await supabaseServer
          .from("chats")
          .update({ kanban_status: targetStageName, updated_at: new Date().toISOString() })
          .eq("id", params.chat_id)
          .eq("restaurant_id", params.restaurant_id);

        if (moveError) {
          runFailed += 1;
          failedCount += 1;
          continue;
        }

        runSent += 1;
        sentCount += 1;
      } catch {
        runFailed += 1;
        failedCount += 1;
      }
      runStatus = runFailed > 0 && runSent === 0 ? "failed" : "success";
      runError = runStatus === "failed" ? "AUTOMATION_ACTIONS_FAILED" : null;
      await supabaseServer
        .from("automation_runs")
        .update({
          status: runStatus,
          error: runError,
          finished_at: new Date().toISOString(),
          executed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      continue;
    }

    if ((automation as any).action_type !== "send_template") {
      skippedCount += 1;
      await supabaseServer
        .from("automation_runs")
        .update({
          status: "skipped",
          error: "UNSUPPORTED_ACTION",
          finished_at: new Date().toISOString(),
          executed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      continue;
    }

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
        runFailed += 1;
        failedCount += 1;
      } else {
        const text = renderTemplate(templateText, context);
        if (!text.trim()) {
          runFailed += 1;
          failedCount += 1;
        } else {
          await sendTextForChat({
            restaurant_id: params.restaurant_id,
            chat_id: params.chat_id,
            text,
          });
          runSent += 1;
          sentCount += 1;
        }
      }
    } catch {
      runFailed += 1;
      failedCount += 1;
    }

    runStatus = runFailed > 0 && runSent === 0 ? "failed" : "success";
    runError = runStatus === "failed" ? "AUTOMATION_ACTIONS_FAILED" : null;
    await supabaseServer
      .from("automation_runs")
      .update({
        status: runStatus,
        error: runError,
        finished_at: new Date().toISOString(),
        executed_at: new Date().toISOString(),
      })
      .eq("id", runId);
  }

  if (!matchedAny) {
    return { ok: true, status: "skipped", reason: "no_automation_match" };
  }

  if (sentCount === 0 && failedCount === 0 && skippedCount > 0) {
    return { ok: true, run_id: firstRunId, status: "skipped", skipped: skippedCount, sent: 0, failed: 0 };
  }

  const finalStatus = failedCount > 0 && sentCount === 0 ? "failed" : "success";

  return {
    ok: true,
    run_id: firstRunId,
    status: finalStatus,
    sent: sentCount,
    failed: failedCount,
    skipped: skippedCount,
  };
}
