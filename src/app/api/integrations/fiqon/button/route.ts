import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { runAutomations } from "@/lib/automations/engine";

export const runtime = "nodejs";

type FiqonBody = {
  event?: string;
  instanceName?: string | null;
  chatid?: string | null;
  messageid?: string | null;
  buttonId?: string | null;
  displayText?: string | null;
  timestamp?: number | string | null;
  owner?: string | null;
};

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractRestaurantIdFromInstanceName(instanceName: string | null) {
  if (!instanceName || !instanceName.startsWith("r-")) return null;
  const match = instanceName.match(
    /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i
  );
  return match?.[1] ?? null;
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const root = raw as Record<string, any>;
  const body = ((root.BODY ?? root) || {}) as FiqonBody;

  const event = readString(body.event);
  const chatid = readString(body.chatid);
  const buttonId = readString(body.buttonId);
  const messageid = readString(body.messageid);

  if (event !== "button_clicked" || !chatid || !buttonId) {
    return NextResponse.json({ ok: false, error: "invalid_button_event" }, { status: 400 });
  }

  let restaurantId = extractRestaurantIdFromInstanceName(readString(body.instanceName));

  if (!restaurantId) {
    const { data: chatsFallback, error: fallbackError } = await supabaseServer
      .from("chats")
      .select("id, restaurant_id")
      .eq("wa_chat_id", chatid)
      .limit(1);

    if (fallbackError) {
      console.error("[fiqon-button] chat_fallback_error", fallbackError.message);
      return NextResponse.json({ ok: false, error: fallbackError.message }, { status: 500 });
    }

    restaurantId = chatsFallback?.[0]?.restaurant_id ?? null;
  }

  if (!restaurantId) {
    return NextResponse.json({ ok: false, error: "restaurant_not_found" }, { status: 404 });
  }

  const { data: chat, error: chatError } = await supabaseServer
    .from("chats")
    .select("id, restaurant_id")
    .eq("wa_chat_id", chatid)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (chatError) {
    return NextResponse.json({ ok: false, error: chatError.message }, { status: 500 });
  }

  if (!chat?.id) {
    return NextResponse.json({ ok: false, error: "chat_not_found" }, { status: 404 });
  }

  const fingerprint = `btn:${chatid}:${messageid ?? buttonId}`;
  const result = await runAutomations({
    restaurant_id: String(chat.restaurant_id),
    chat_id: String(chat.id),
    trigger: "button_clicked",
    fingerprint,
    context: {
      chatid,
      messageid,
      buttonId,
      displayText: body.displayText ?? null,
    },
  });

  console.log("[fiqon-button] done", { chatid, buttonId, ok: (result as any)?.ok === true });
  return NextResponse.json(result, { status: 200 });
}

