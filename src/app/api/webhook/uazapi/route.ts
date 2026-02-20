import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, route: "uazapi" }, { status: 200 });
}

export async function POST(req: Request) {
  console.log("[UAZAPI] WEBHOOK HIT", new Date().toISOString());

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    console.log("[UAZAPI] INVALID JSON");
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  console.log("[UAZAPI] BODY_KEYS", Object.keys(body || {}));

  // ✅ Payload real (pelo seu log): body.chat.wa_chatid e body.chat.phone
  const wa_chat_id =
    body?.chat?.wa_chatid ||
    body?.chat?.wa_chatId ||
    body?.message?.chatid ||
    body?.chatId ||
    body?.chat_id ||
    body?.data?.chatId ||
    body?.data?.chat_id;

  const phone =
    body?.chat?.phone ||
    body?.message?.from ||
    body?.from ||
    body?.phone ||
    body?.data?.from ||
    body?.data?.phone;

  // ✅ Texto (pode variar)
  const text =
    body?.message?.text ||
    body?.message?.message?.text ||
    body?.message?.body?.text ||
    body?.chat?.wa_lastMessageTextVote ||
    body?.text ||
    body?.data?.text ||
    body?.data?.message?.text ||
    body?.data?.body?.text ||
    null;

  // ✅ id da mensagem (tenta pegar do message)
  const wa_message_id =
    body?.message?.id ||
    body?.message?.messageId ||
    body?.messageId ||
    body?.data?.messageId ||
    body?.data?.id ||
    null;

  console.log("[UAZAPI] PARSED", { wa_chat_id, phone, hasText: !!text, wa_message_id });

  if (!wa_chat_id || !phone) {
    console.log("[UAZAPI] MISSING FIELDS", { wa_chat_id, phone });
    return NextResponse.json({ ok: false, error: "Missing wa_chat_id or phone" }, { status: 400 });
  }

  // 1) upsert contact
  const { data: contact, error: cErr } = await supabaseServer
    .from("contacts")
    .upsert({ phone }, { onConflict: "phone" })
    .select("*")
    .single();

  if (cErr) {
    console.log("[UAZAPI] CONTACT UPSERT ERROR", cErr);
    return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
  }

  // 2) upsert chat (sem mexer no unread_count)
const { data: chat, error: chErr } = await supabaseServer
  .from("chats")
  .upsert(
    {
      wa_chat_id,
      contact_id: contact.id,
      last_message: text,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "wa_chat_id" }
  )
  .select("*")
  .single();

if (chErr) {
  console.log("[UAZAPI] CHAT UPSERT ERROR", chErr);
  return NextResponse.json({ ok: false, error: chErr.message }, { status: 500 });
}

// ✅ incrementa unread_count
const { error: incErr } = await supabaseServer.rpc("increment_unread", {
  p_wa_chat_id: wa_chat_id,
  p_last_message: text,
});

if (incErr) {
  console.log("[UAZAPI] INCREMENT ERROR", incErr);
}

 // 3) insert message (anti-duplicação)
const { error: mErr } = await supabaseServer.from("messages").upsert(
  {
    chat_id: chat.id,
    direction: "in",
    wa_message_id,
    text,
    payload: body,
  },
  { onConflict: "wa_message_id" }
);

  if (mErr) {
    console.log("[UAZAPI] MESSAGE INSERT ERROR", mErr);
    return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}