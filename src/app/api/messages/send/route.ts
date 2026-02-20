import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, "");
}

function guessNumberFromChatId(waChatId: string | null) {
  if (!waChatId) return null;
  // "553199999999@s.whatsapp.net" -> "553199999999"
  return waChatId.split("@")[0] ?? null;
}

export async function POST(req: Request) {
  const body = await req.json();

  const chat_id: string | undefined = body?.chat_id;
  const text: string | undefined = body?.text;

  if (!chat_id || !text) {
    return NextResponse.json({ ok: false, error: "Missing chat_id or text" }, { status: 400 });
  }

  // Pega chat + contato (pra ter phone)
  const { data: chat, error: chErr } = await supabaseServer
    .from("chats")
    .select("id, wa_chat_id, contacts(phone)")
    .eq("id", chat_id)
    .single();

  if (chErr || !chat) {
    return NextResponse.json({ ok: false, error: chErr?.message || "Chat not found" }, { status: 404 });
  }

  const base = process.env.UAZAPI_BASE_URL;
  const token = process.env.UAZAPI_TOKEN;

  if (!base || !token) {
    return NextResponse.json({ ok: false, error: "UAZAPI env not configured" }, { status: 500 });
  }

  const sendUrl = `${normalizeBaseUrl(base)}/send/text`;

  // ✅ GARANTE number só com dígitos
  const rawNumber =
    (chat as any)?.contacts?.phone ||
    guessNumberFromChatId((chat as any)?.wa_chat_id ?? null) ||
    "";

  const number = String(rawNumber).replace(/\D/g, ""); // remove tudo que não for número

  if (!number) {
    return NextResponse.json(
      { ok: false, error: "Missing number (phone) for this chat" },
      { status: 400 }
    );
  }

  // ✅ payload mais compatível: number + text
  const payload = { number, text };

  const uazRes = await fetch(sendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token: token, // ✅ UazAPI usa header 'token'
    },
    body: JSON.stringify(payload),
  });

  const raw = await uazRes.text();
  let uazJson: any = null;
  try {
    uazJson = JSON.parse(raw);
  } catch {
    // se vier HTML/texto, fica em raw
  }

  if (!uazRes.ok) {
    return NextResponse.json(
      { ok: false, error: "UazAPI send failed", details: uazJson ?? raw },
      { status: 502 }
    );
  }

  const wa_message_id = uazJson?.id || uazJson?.messageId || null;

  // salva no banco como mensagem enviada
  const { error: mErr } = await supabaseServer.from("messages").insert({
    chat_id: (chat as any).id,
    direction: "out",
    wa_message_id,
    text,
    payload: uazJson ?? raw,
  });

  if (mErr) {
    return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });
  }

  await supabaseServer
    .from("chats")
    .update({ last_message: text, updated_at: new Date().toISOString() })
    .eq("id", (chat as any).id);

  return NextResponse.json({ ok: true, uaz: uazJson ?? raw });
}