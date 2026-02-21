import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { extractButtonClicked } from "@/lib/uazapi/triggers";
import { runAutomations } from "@/lib/automations/engine";

export const runtime = "nodejs";

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
    const { data, error } = await supabaseServer
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
    const { data } = await supabaseServer
      .from("restaurants")
      .select("id")
      .eq("id", instanceRestaurantRef)
      .maybeSingle();
    if (data) restaurant = data;
  }

  if (!restaurant && instanceId) {
    const { data } = await supabaseServer
      .from("restaurants")
      .select("id")
      .eq("uaz_instance_id", instanceId)
      .maybeSingle();
    if (data) restaurant = data;
  }

  if (!restaurant && instanceToken) {
    const { data, error } = await supabaseServer
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
    const { data, error } = await supabaseServer
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
      const { error: webhookEventError } = await supabaseServer.from("webhook_events").insert({
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
    await supabaseServer
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
    await supabaseServer
      .from("chats")
      .update({ is_typing: true })
      .eq("restaurant_id", restaurantId)
      .eq("wa_chat_id", waChatId);

    return NextResponse.json({ ok: true, presence: "composing" }, { status: 200 });
  }

  if (eventLower === "presence.update" && waChatId && statusValue === "paused") {
    await supabaseServer
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

    await supabaseServer
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

  let contactId: string;
  const { data: existingContact, error: contactSelectError } = await supabaseServer
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
    const { data: newContact, error: contactInsertError } = await supabaseServer
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
  const { data: existingChat, error: chatSelectError } = await supabaseServer
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
    const { error: chatUpdateError } = await supabaseServer
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
    const { data: newChat, error: chatInsertError } = await supabaseServer
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
    const { data: exists, error: dedupeError } = await supabaseServer
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

  const { error: messageInsertError } = await supabaseServer.from("messages").insert({
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

  try {
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
  } catch (automationError) {
    console.error("[webhook/uazapi] automation button_clicked failed", automationError);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
