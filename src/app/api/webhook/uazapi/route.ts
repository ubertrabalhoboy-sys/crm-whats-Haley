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

  // ✅ parser corrigido pro payload real que você mostrou
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

  // 2) upsert chat (mantém simples pra não quebrar)
  const { data: chat, error: chErr } = await supabaseServer
    .from("chats")
    .upsert(
      {
        wa_chat_id,
        contact_id: contact.id,
        last_message: text,
        unread_count: 1,
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

  // 3) Anti-duplicação segura (SEM upsert)
  // Se tiver wa_message_id, checa se já existe
  if (wa_message_id) {
    const { data: exists, error: e1 } = await supabaseServer
      .from("messages")
      .select("id")
      .eq("wa_message_id", wa_message_id)
      .limit(1);

    if (e1) {
      console.log("[UAZAPI] DEDUPE CHECK ERROR", e1);
    } else if (exists && exists.length > 0) {
      // Já existe -> não insere de novo
      return NextResponse.json({ ok: true, duplicated: true }, { status: 200 });
    }
  }

  // 4) insert message (salva a mensagem recebida)
  const { error: mErr } = await supabaseServer.from("messages").insert({
    chat_id: chat.id,
    direction: "in",
    wa_message_id: wa_message_id ?? null,
    text,
    payload: body,
  });

  if (mErr) {
    console.log("[UAZAPI] MESSAGE INSERT ERROR", mErr);
    return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}