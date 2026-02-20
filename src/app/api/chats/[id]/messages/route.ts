import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: { chatId: string } }) {
  const chatId = params.chatId;

  const { data: messages, error } = await supabaseServer
    .from("messages")
    .select("id, direction, text, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  if (error) {
    const res = NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  const res = NextResponse.json({ ok: true, messages: messages ?? [] }, { status: 200 });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}