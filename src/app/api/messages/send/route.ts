import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UAZAPI_BASE_URL, UAZAPI_GLOBAL_API_KEY } from "@/lib/shared/env";

type ChatWithContact = {
  id: string;
  wa_chat_id: string | null;
  contacts:
    | { phone?: string | null }
    | Array<{ phone?: string | null }>
    | null;
};

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, "");
}

function guessNumberFromChatId(waChatId: string | null) {
  if (!waChatId) return null;
  return waChatId.split("@")[0] ?? null;
}

function readContactPhone(chat: ChatWithContact) {
  if (Array.isArray(chat.contacts)) {
    return chat.contacts[0]?.phone ?? null;
  }

  return chat.contacts?.phone ?? null;
}

function parseJsonSafe(text: string) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }

  const restaurantId = profile?.restaurant_id ?? null;
  if (!restaurantId) {
    return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 });
  }

  const body = await req.json();
  const chatId: string | undefined = body?.chat_id;
  const text: string | undefined = body?.text;

  if (!chatId || !text) {
    return NextResponse.json({ ok: false, error: "Missing chat_id or text" }, { status: 400 });
  }

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("uaz_instance_token")
    .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant?.uaz_instance_token) {
    return NextResponse.json(
      { ok: false, error: restaurantError?.message || "INSTANCE_TOKEN_MISSING" },
      { status: 409 }
    );
  }

  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("id, wa_chat_id, contacts(phone)")
    .eq("id", chatId)
    .eq("restaurant_id", restaurantId)
    .single();

  if (chatError || !chat) {
    return NextResponse.json(
      { ok: false, error: chatError?.message || "Chat not found" },
      { status: 404 }
    );
  }

  const baseUrl = UAZAPI_BASE_URL;
  const instanceToken = restaurant.uaz_instance_token;
  if (!baseUrl || !instanceToken) {
    return NextResponse.json(
      { ok: false, error: "UAZAPI env not configured" },
      { status: 500 }
    );
  }

  const typedChat = chat as ChatWithContact;
  const rawNumber =
    readContactPhone(typedChat) ||
    guessNumberFromChatId(typedChat.wa_chat_id) ||
    "";
  const number = String(rawNumber).replace(/\D/g, "");

  if (!number) {
    return NextResponse.json(
      { ok: false, error: "Missing number (phone) for this chat" },
      { status: 400 }
    );
  }

  const sendUrl = `${normalizeBaseUrl(baseUrl)}/send/text`;
  const payload = { number, text };

  const uazRes = await fetch(sendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: UAZAPI_GLOBAL_API_KEY || "",
      token: instanceToken,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const raw = await uazRes.text();
  const uazJson = parseJsonSafe(raw);

  if (!uazRes.ok) {
    return NextResponse.json(
      { ok: false, error: "UazAPI send failed", details: uazJson ?? raw },
      { status: 502 }
    );
  }

  const waMessageId =
    (uazJson && typeof uazJson === "object" && "id" in uazJson && uazJson.id) ||
    (uazJson && typeof uazJson === "object" && "messageId" in uazJson && uazJson.messageId) ||
    null;

  const { error: messageError } = await supabase.from("messages").insert({
    chat_id: typedChat.id,
    restaurant_id: restaurantId,
    direction: "out",
    wa_message_id: waMessageId,
    text,
    payload: uazJson ?? raw,
  });

  if (messageError) {
    return NextResponse.json({ ok: false, error: messageError.message }, { status: 500 });
  }

  await supabase
    .from("chats")
    .update({ last_message: text, updated_at: new Date().toISOString() })
    .eq("id", typedChat.id)
    .eq("restaurant_id", restaurantId);

  return NextResponse.json({ ok: true, uaz: uazJson ?? raw });
}
