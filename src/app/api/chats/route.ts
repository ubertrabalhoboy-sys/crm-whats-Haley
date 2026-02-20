import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";


export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { data, error } = await supabaseServer
    .from("chats")
    .select("id, wa_chat_id, kanban_status, last_message, unread_count, updated_at, contacts(phone, name)")
    .order("updated_at", { ascending: false });

  if (error) {
    
  }

  const res = NextResponse.json({ ok: true, chats: data }, { status: 200 });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
res.headers.set("Pragma", "no-cache");
res.headers.set("Expires", "0");
return res;
}