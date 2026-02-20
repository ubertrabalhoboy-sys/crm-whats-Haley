import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: chatId } = await ctx.params;

  const { error } = await supabaseServer
    .from("chats")
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq("id", chatId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}