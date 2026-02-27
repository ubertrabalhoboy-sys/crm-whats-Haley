import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
import { extractButtonClicked } from "@/lib/uazapi/triggers";
import { runAutomations } from "@/lib/automations/engine";
import { triggerFiqonWebhook } from "@/lib/fiqon-webhook";
import { processAiMessage } from "@/lib/ai/orchestrator";

export const runtime = "nodejs";

// Rate Limiter Memory Map (Persists across warm serverless invocations)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_MESSAGES_PER_MINUTE = 15; // Max allowed messages per minute

async function sendRateLimitWarning(waChatId: string, instanceName: string, instanceToken: string) {
  try {
    await fetch("https://api.uazapi.com/v1/messages/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.UAZAPI_GLOBAL_API_KEY}`,
        "Instance-Token": instanceToken,
      },
      body: JSON.stringify({
        number: waChatId,
        textMessage: { text: "Opa, vai com calma, minha cozinha tá processando seu pedido! Aguarde um instante antes de mandar mais mensagens. 🧑‍🍳🛑" },
        instanceName,
      }),
    });
  } catch (error) {
    console.error("[RATE LIMIT] Failed to send warning warning to Uazapi", error);
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "uazapi" }, { status: 200 });
}

export async function POST(req: Request) {
  const reqUrl = new URL(req.url);
  let parsedBody: unknown = null;
  try {
    parsedBody = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  const body = parsedBody as Record<string, any>;

  const readString = (...values: unknown[]) => {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };

  const toBool = (value: unknown) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return ["true", "1", "yes"].includes(value.toLowerCase());
    return false;
  };

  const instanceId = readString(
    body?.instance?.id,
    body?.instanceId,
    body?.instance_id,
    body?.data?.instance?.id
  );
  const instanceName = readString(
    body?.instanceName,
    body?.instance?.name,
    body?.data?.instanceName,
    body?.data?.instance?.name
  );
  const instanceRestaurantRef = readString(
    body?.instance?.adminField01,
    body?.data?.instance?.adminField01,
    body?.adminField01,
    body?.data?.adminField01
  );
  const instanceOwner = readString(
    body?.instance?.owner,
    body?.data?.instance?.owner,
    body?.owner,
    body?.data?.owner
  );
  const instanceToken = readString(
    body?.instance?.token,
    body?.data?.instance?.token,
    body?.token,
    body?.data?.token,
    reqUrl.searchParams.get("token")
  );

  let restaurant: { id: string } | null = null;

  if (instanceName) {
    const { data, error } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("uaz_instance_name", instanceName)
      .maybeSingle();

    if (error) {
      console.warn("[webhook/uazapi] instanceName resolution failed, fallback to legacy resolver", {
        error: error.message,
      });
    }
    if (data) restaurant = data;
  }

  if (instanceRestaurantRef) {
    const { data } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("id", instanceRestaurantRef)
      .maybeSingle();
    if (data) restaurant = data;
  }

  if (!restaurant && instanceId) {
    const { data } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("uaz_instance_id", instanceId)
      .maybeSingle();
    if (data) restaurant = data;
  }

  if (!restaurant && instanceToken) {
    const { data, error } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("uaz_instance_token", instanceToken)
      .maybeSingle();
    if (error) {
      console.warn("[webhook/uazapi] instance token resolution failed", { error: error.message });
    }
    if (data) restaurant = data;
  }

  if (!restaurant && instanceOwner) {
    const { data, error } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("uaz_instance_owner", instanceOwner)
      .maybeSingle();
    if (error) {
      console.warn("[webhook/uazapi] instance owner resolution failed", { error: error.message });
    }
    if (data) restaurant = data;
  }

  if (!restaurant) {
    try {
      const { error: webhookEventError } = await supabaseAdmin.from("webhook_events").insert({
        provider: "uazapi",
        payload: body,
        instance_name: instanceName,
        instance_id: instanceId,
        created_at: new Date().toISOString(),
      });
      if (webhookEventError) {
        console.warn("[webhook/uazapi] webhook_events insert skipped", webhookEventError.message);
      }
    } catch (e) {
      console.warn("[webhook/uazapi] webhook_events table not available");
    }

    console.warn("[webhook/uazapi] restaurant unresolved", {
      instanceName,
      instanceId,
      instanceRestaurantRef,
      instanceOwner,
      hasInstanceToken: Boolean(instanceToken),
    });
    return NextResponse.json({ ok: true, reason: "tenant_unresolved" }, { status: 200 });
  }

  const restaurantId = restaurant.id;
  const event = readString(body?.event, body?.type, body?.data?.event) || "";
  const eventLower = event.toLowerCase();

  const wasSentByApi = toBool(
    body?.wasSentByApi ??
    body?.message?.wasSentByApi ??
    body?.data?.wasSentByApi ??
    body?.data?.message?.wasSentByApi
  );

  const isGroupYes = toBool(
    body?.isGroupYes ??
    body?.chat?.isGroupYes ??
    body?.message?.isGroupYes ??
    body?.data?.isGroupYes ??
    body?.data?.message?.isGroupYes
  );

  const fromMe = toBool(
    body?.fromMe ??
    body?.message?.fromMe ??
    body?.data?.fromMe ??
    body?.data?.message?.fromMe ??
    body?.key?.fromMe ??
    body?.message?.key?.fromMe ??
    body?.data?.key?.fromMe ??
    body?.data?.message?.key?.fromMe
  );

  if (wasSentByApi || isGroupYes || fromMe) {
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  const waMessageId = readString(
    body?.message?.id,
    body?.message?.key?.id,
    body?.message?.messageId,
    body?.key?.id,
    body?.messageId,
    body?.id,
    body?.data?.message?.key?.id,
    body?.data?.messageId,
    body?.data?.id
  );

  const statusValue = readString(
    body?.status,
    body?.message?.status,
    body?.messageStatus,
    body?.data?.status
  );

  if ((eventLower === "message.update" || eventLower === "messages_update") && waMessageId) {
    await supabaseAdmin
      .from("messages")
      .update({ status: statusValue ?? null })
      .eq("restaurant_id", restaurantId)
      .eq("wa_message_id", waMessageId);

    return NextResponse.json({ ok: true, updated: true }, { status: 200 });
  }

  const waChatId = readString(
    body?.chat?.wa_chatid,
    body?.chat?.wa_chatId,
    body?.message?.chatid,
    body?.message?.chatId,
    body?.chatId,
    body?.chat_id,
    body?.data?.chatId,
    body?.data?.chat_id
  );

  if (eventLower === "presence.update" && waChatId && statusValue === "composing") {
    await supabaseAdmin
      .from("chats")
      .update({ is_typing: true })
      .eq("restaurant_id", restaurantId)
      .eq("wa_chat_id", waChatId);

    return NextResponse.json({ ok: true, presence: "composing" }, { status: 200 });
  }

  if (eventLower === "presence.update" && waChatId && statusValue === "paused") {
    await supabaseAdmin
      .from("chats")
      .update({ is_typing: false })
      .eq("restaurant_id", restaurantId)
      .eq("wa_chat_id", waChatId);

    return NextResponse.json({ ok: true, presence: "paused" }, { status: 200 });
  }

  if (eventLower.includes("connection")) {
    const connectionStatus =
      readString(
        body?.instance?.status,
        body?.connection?.status,
        body?.connectionStatus,
        body?.status,
        body?.data?.status
      ) ?? "disconnected";

    await supabaseAdmin
      .from("restaurants")
      .update({ uaz_status: connectionStatus })
      .eq("id", restaurantId);

    return NextResponse.json({ ok: true, connection: connectionStatus }, { status: 200 });
  }

  const phoneRaw = readString(
    body?.chat?.phone,
    body?.message?.from,
    body?.from,
    body?.phone,
    body?.data?.from,
    body?.data?.phone
  );

  const phone = phoneRaw ? phoneRaw.replace(/\D/g, "") : null;
  const text =
    readString(
      body?.message?.text,
      body?.message?.message?.text,
      body?.message?.body?.text,
      body?.chat?.wa_lastMessageTextVote,
      body?.text,
      body?.data?.text,
      body?.data?.message?.text,
      body?.data?.body?.text
    ) ?? null;

  if (!waChatId || !phone) {
    return NextResponse.json({ ok: true, ignored: true, reason: "missing_fields" }, { status: 200 });
  }

  // --- 🛡️ RATE LIMITING ENFORCEMENT 🛡️ ---
  const now = Date.now();
  const userRate = rateLimitMap.get(phone) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > userRate.resetAt) {
    // Window expired, reset counter
    userRate.count = 1;
    userRate.resetAt = now + RATE_LIMIT_WINDOW_MS;
  } else {
    // Increment counter
    userRate.count++;
  }

  rateLimitMap.set(phone, userRate);

  if (userRate.count > MAX_MESSAGES_PER_MINUTE) {
    console.warn(`[RATE LIMIT] Phone ${phone} exceeded limits (${userRate.count} msgs/min). Dropping payload.`);

    // Only send the warning exactly on the threshold breach to avoid spamming them back
    if (userRate.count === MAX_MESSAGES_PER_MINUTE + 1 && instanceName && instanceToken) {
      // Don't await the warning so we don't block the response
      sendRateLimitWarning(waChatId, instanceName, instanceToken);
    }

    return NextResponse.json({ ok: true, ignored: true, reason: "rate_limited" }, { status: 200 });
  }
  // ---------------------------------------

  let contactId: string;
  const { data: existingContact, error: contactSelectError } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("phone", phone)
    .maybeSingle();

  if (contactSelectError) {
    return NextResponse.json({ ok: false, error: contactSelectError.message }, { status: 500 });
  }

  if (existingContact?.id) {
    contactId = existingContact.id;
  } else {
    const { data: newContact, error: contactInsertError } = await supabaseAdmin
      .from("contacts")
      .insert({ restaurant_id: restaurantId, phone })
      .select("id")
      .single();

    if (contactInsertError || !newContact) {
      return NextResponse.json(
        { ok: false, error: contactInsertError?.message || "contact_insert_failed" },
        { status: 500 }
      );
    }
    contactId = newContact.id;
  }

  let chatId: string;
  const { data: existingChat, error: chatSelectError } = await supabaseAdmin
    .from("chats")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("wa_chat_id", waChatId)
    .maybeSingle();

  if (chatSelectError) {
    return NextResponse.json({ ok: false, error: chatSelectError.message }, { status: 500 });
  }

  if (existingChat?.id) {
    chatId = existingChat.id;
    const { error: chatUpdateError } = await supabaseAdmin
      .from("chats")
      .update({
        contact_id: contactId,
        last_message: text,
        unread_count: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chatId)
      .eq("restaurant_id", restaurantId);

    if (chatUpdateError) {
      return NextResponse.json({ ok: false, error: chatUpdateError.message }, { status: 500 });
    }
  } else {
    const { data: newChat, error: chatInsertError } = await supabaseAdmin
      .from("chats")
      .insert({
        restaurant_id: restaurantId,
        wa_chat_id: waChatId,
        contact_id: contactId,
        last_message: text,
        unread_count: 1,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (chatInsertError || !newChat) {
      return NextResponse.json(
        { ok: false, error: chatInsertError?.message || "chat_insert_failed" },
        { status: 500 }
      );
    }
    chatId = newChat.id;
  }

  if (waMessageId) {
    const { data: exists, error: dedupeError } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("wa_message_id", waMessageId)
      .limit(1);

    if (dedupeError) {
      return NextResponse.json({ ok: false, error: dedupeError.message }, { status: 500 });
    }

    if (exists && exists.length > 0) {
      return NextResponse.json({ ok: true, deduped: true }, { status: 200 });
    }
  }

  const { error: messageInsertError } = await supabaseAdmin.from("messages").insert({
    chat_id: chatId,
    restaurant_id: restaurantId,
    direction: "in",
    wa_message_id: waMessageId ?? null,
    text,
    payload: body,
  });

  if (messageInsertError) {
    const isDuplicateKey =
      (messageInsertError as any)?.code === "23505" ||
      String((messageInsertError as any)?.message || "").toLowerCase().includes("duplicate key") ||
      String((messageInsertError as any)?.message || "").includes("messages_wa_message_id_uq");
    if (isDuplicateKey) {
      return NextResponse.json({ ok: true, deduped: true }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: messageInsertError.message }, { status: 500 });
  }

  // ─── [AI ORCHESTRATOR START] ───
  // Non-blocking call to process the incoming text with standard LLM tools.
  // We only run this if it's a standard text message (not empty, not just a system event).
  if (text && text.trim().length > 0) {
    processAiMessage({
      restaurantId,
      chatId,
      waChatId,
      instanceName: instanceName || undefined,
      incomingText: text,
    }).catch(err => console.error("[AI LOOP] Background failure:", err));
  }
  // ───────────────────────────────

  try {
    const bodyRoot = body?.BODY;
    const bodyEventType = readString(bodyRoot?.EventType);
    const bodyMessageType = readString(bodyRoot?.message?.messageType);
    const bodyFromMe = toBool(bodyRoot?.message?.fromMe);

    const bodyButtonId = readString(
      bodyRoot?.message?.buttonOrListid,
      bodyRoot?.message?.content?.selectedButtonID
    );
    const bodyDisplayText = readString(bodyRoot?.message?.content?.Response?.SelectedDisplayText);
    const bodyChatId = readString(bodyRoot?.message?.chatid);
    const bodyMessageId = readString(bodyRoot?.message?.messageid);
    if (
      bodyEventType?.toLowerCase() === "messages" &&
      bodyMessageType === "ButtonsResponseMessage" &&
      !bodyFromMe &&
      bodyButtonId &&
      bodyChatId &&
      bodyMessageId
    ) {
      if (!restaurantId || !chatId) {
        console.warn("[webhook/uazapi] button_clicked skipped: missing tenant/chat context");
      } else {
        const fingerprint = `btn:${bodyChatId}:${bodyMessageId}`;
        await runAutomations({
          restaurant_id: restaurantId,
          chat_id: chatId,
          trigger: "button_clicked",
          fingerprint,
          context: {
            chatid: bodyChatId,
            messageid: bodyMessageId,
            buttonId: bodyButtonId,
            displayText: bodyDisplayText,
            quoted: bodyRoot?.message?.quoted ?? null,
          },
        });
      }

    } else {
      const buttonClicked = extractButtonClicked(body);
      if (buttonClicked?.buttonId && buttonClicked?.chatId && buttonClicked?.messageId) {
        const fingerprint = `btn:${buttonClicked.chatId}:${buttonClicked.messageId}`;
        await runAutomations({
          restaurant_id: restaurantId,
          chat_id: chatId,
          trigger: "button_clicked",
          fingerprint,
          context: {
            buttonId: buttonClicked.buttonId,
            displayText: buttonClicked.displayText,
            messageId: buttonClicked.messageId,
            chatId: buttonClicked.chatId,
            waChatId,
            instanceName,
          },
        });
      }
    }

    const b = body?.BODY ?? body;
    const buttonClicked = extractButtonClicked(body);

    if (buttonClicked?.buttonId && buttonClicked?.chatId && buttonClicked?.messageId) {
      // FIRE AND FORGET GAMIFICATION INTERCEPTOR (Non-Blocking)
      (async () => {
        try {
          const btnId = buttonClicked.buttonId;

          // Fast check if this is a known product stored in 'produtos_promo'
          // A user might pass the raw ID or a 'produto_XXX' string
          const { data: promoData } = await supabaseAdmin
            .from("produtos_promo")
            .select("nome, preco_promo")
            .or(`id.eq.${btnId},nome.ilike.%${btnId}%`)
            .maybeSingle();

          if (promoData) {
            console.log(`[webhook/gamification] Matching product found: ${promoData.nome} - Updating ROI.`);

            // Standard Approach (safe enough for most chat flows):
            const { data: chatData } = await supabaseAdmin
              .from("chats")
              .select("valor_total_vendas")
              .eq("id", chatId)
              .single();

            const val = chatData?.valor_total_vendas ? Number(chatData.valor_total_vendas) : 0;
            const newVal = val + Number(promoData.preco_promo);

            await supabaseAdmin
              .from("chats")
              .update({
                valor_total_vendas: newVal,
                cupom_ganho: promoData.nome,
                kanban_status: "Pedido Recebido"
              })
              .eq("id", chatId);

            // Disparo bidirecional: buscar stage_id e disparar o Fiqon
            const { data: stageRow } = await supabaseAdmin
              .from("kanban_stages")
              .select("id")
              .eq("restaurant_id", restaurantId)
              .eq("name", "Pedido Recebido")
              .maybeSingle();

            if (stageRow?.id) {
              triggerFiqonWebhook(chatId, stageRow.id).catch(err =>
                console.error("[webhook/gamification] Erro no Fiqon webhook:", err)
              );
            }
          }
        } catch (err) {
          console.error("[webhook/gamification] Non-critical error executing ROI updates:", err);
        }
      })();
    }

    if (buttonClicked) {
      const fiqonWebhookUrl = process.env.FIQON_WEBHOOK_URL;
      if (!fiqonWebhookUrl) {
        console.warn("[fiqon-forward] missing_env");
      } else {
        const buttonId =
          readString(b?.message?.buttonOrListid, b?.message?.content?.selectedButtonID) ?? null;
        const messageid = readString(b?.message?.messageid) ?? null;
        const payload = {
          event: "button_clicked",
          instanceName: readString(b?.instanceName),
          chatid: readString(b?.message?.chatid),
          messageid,
          buttonId,
          displayText:
            readString(b?.message?.vote, b?.message?.content?.Response?.SelectedDisplayText) ?? null,
          timestamp: b?.message?.messageTimestamp ?? null,
          owner: readString(b?.owner),
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        fetch(fiqonWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
          .then((resp) => {
            console.log("[fiqon-forward] sent", { status: resp.status, buttonId, messageid });
          })
          .catch((err) => {
            console.error("[fiqon-forward] fail", {
              error: String(err),
              buttonId,
              messageid,
            });
          })
          .finally(() => {
            clearTimeout(timeout);
          });
      }
    }
  } catch (automationError) {
    console.error("[webhook/uazapi] automation button_clicked failed", automationError);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}