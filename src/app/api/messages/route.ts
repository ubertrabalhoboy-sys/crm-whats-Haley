import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { data, error } = await supabaseServer
    .from("chats")
    .select(`
      id,
      wa_chat_id,
      kanban_status,
      last_message,
      unread_count,
      updated_at,
      contacts ( phone, name )
    `)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true, chats: data ?? [] });
  res.headers.set("Cache-Control", "no-store");
  return res;
}