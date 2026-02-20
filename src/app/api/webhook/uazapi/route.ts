import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, route: "uazapi" }, { status: 200 });
}

function normalizePhone(input: string | null | undefined) {
  if (!input) return null;
  // pega só números (remove +, espaços, etc)
  const digits = input.replace(/\D/g, "");
  return digits.length ? digits : null;
}

function phoneFromChatId(chatId: string | null | undefined) {
  if (!chatId) return null;
  // ex: "5531920056443@s.whatsapp.net" -> "5531920056443"
  const left = chatId.split("@")[0] ?? "";
  return normalizePhone(left);
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

  // --- ✅ PARSER CORRIGIDO PARA O FORMATO REAL DA UAZAPI ---
  const wa_chat_id =
    body?.chat?.wa_chatid || // ✅ principal (você mostrou no payload)
    body?.chat?.wa_chatId ||
    body?.chat?.id ||
    body?.chatId ||
    body?.chat_id ||
    body?.data?.chatId ||
    body?.data?.chat_id ||
    null;

  const phone =
    normalizePhone(body?.chat?.phone) || // ✅ principal (você mostrou "+55 31 920056443")
    normalizePhone(body?.phone) ||
    normalizePhone(body?.from) ||
    normalizePhone(body?.data?.from) ||
    normalizePhone(body?.data?.phone) ||
    phoneFromChatId(body?.chat?.wa_chatid) || // fallback
    phoneFromChatId(body?.chatId) ||
    null;

  const text =
    body?.message?.text ||
    body?.message?.body?.text ||
    body?.message?.body ||
    body?.message?.caption ||
    body?.message?.conversation ||
    body?.text ||
    body?.data?.text ||
    body?.data?.message?.text ||
    body?.data?.body?.text ||
    null;

  const wa_message_id =
    body?.message?.id ||
    body?.message?.key?.id ||
    body?.messageId ||
    body?.data?.messageId ||
    body?.data?.id ||
    null;

  console.log("[UAZAPI] PARSED", { wa_chat_id, phone, hasText: !!text, wa_message_id });

  if (!wa_chat_id || !phone) {
    console.log("[UAZAPI] MISSING FIELDS", { wa_chat_id, phone });
    return NextResponse.json(
      { ok: false, error: "Missing wa_chat_id or phone" },
      { status: 400 }
    );
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

  // 2) upsert chat
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

  // 3) insert message
  const { error: mErr } = await supabaseServer.from("messages").insert({
    chat_id: chat.id,
    direction: "in",
    wa_message_id,
    text,
    payload: body,
  });

  if (mErr) {
    console.log("[UAZAPI] MESSAGE INSERT ERROR", mErr);
    return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}