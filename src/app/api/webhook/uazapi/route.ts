import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, route: "uazapi" }, { status: 200 });
}

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const reqUrl = new URL(req.url);

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

  const instanceToken = readString(
    reqUrl.searchParams.get("token"),
    body?.token,
    body?.instanceToken,
    body?.instance?.token,
    body?.data?.token,
    body?.data?.instance?.token
  );

  const instanceId = readString(
    reqUrl.searchParams.get("instanceId"),
    reqUrl.searchParams.get("instance_id"),
    body?.instance?.id,
    body?.instanceId,
    body?.instance_id,
    body?.data?.instance?.id
  );
  const instanceRestaurantRef = readString(
    body?.instance?.adminField01,
    body?.data?.instance?.adminField01,
    body?.adminField01,
    body?.data?.adminField01
  );

  let restaurant: { id: string } | null = null;

  if (instanceId) {
    const { data } = await supabaseServer
      .from("restaurants")
      .select("id")
      .eq("uaz_instance_id", instanceId)
      .maybeSingle();
    if (data) restaurant = data;
  }

  if (!restaurant && instanceRestaurantRef) {
    const { data } = await supabaseServer
      .from("restaurants")
      .select("id")
      .eq("id", instanceRestaurantRef)
      .maybeSingle();
    if (data) restaurant = data;
  }

  if (!restaurant && instanceToken) {
    const { data } = await supabaseServer
      .from("restaurants")
      .select("id")
      .eq("uaz_instance_token", instanceToken)
      .maybeSingle();
    if (data) restaurant = data;
  }

  if (!restaurant) {
    return NextResponse.json({ ok: false, error: "INSTANCE_NOT_MAPPED" }, { status: 400 });
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

  if (wasSentByApi || isGroupYes) {
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  const waMessageId = readString(
    body?.message?.id,
    body?.message?.messageId,
    body?.messageId,
    body?.id,
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
      .eq("restaurant_id", restaurantId)
      .eq("wa_message_id", waMessageId)
      .limit(1);

    if (dedupeError) {
      return NextResponse.json({ ok: false, error: dedupeError.message }, { status: 500 });
    }

    if (exists && exists.length > 0) {
      return NextResponse.json({ ok: true, duplicated: true }, { status: 200 });
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
    return NextResponse.json({ ok: false, error: messageInsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
