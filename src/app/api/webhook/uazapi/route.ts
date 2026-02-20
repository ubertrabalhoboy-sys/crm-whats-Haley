import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// ✅ Isso evita 405 quando você abre no navegador (GET)
export async function GET() {
  return NextResponse.json({ ok: true, route: "uazapi" }, { status: 200 });
}

export async function POST(req: Request) {
  // ✅ LOG IMEDIATO: se isso não aparecer no Render, o webhook não está chegando
  console.log("[UAZAPI] WEBHOOK HIT", new Date().toISOString());

  let body: any = null;
  try {
    body = await req.json();
  } catch (e) {
    console.log("[UAZAPI] INVALID JSON");
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  console.log("[UAZAPI] BODY_KEYS", Object.keys(body || {}));
  console.log("[UAZAPI] BODY_SAMPLE", JSON.stringify(body).slice(0, 1500));

  const wa_chat_id =
    body?.chatId ||
    body?.chat_id ||
    body?.data?.chatId ||
    body?.data?.chat_id;

  const phone =
    body?.phone ||
    body?.data?.from ||
    body?.from ||
    body?.data?.phone;

  const text =
    body?.text ||
    body?.message?.text ||
    body?.data?.text ||
    body?.data?.message?.text ||
    body?.data?.body?.text ||
    null;

  const wa_message_id =
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