import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) {
  const params = await context.params;
  const id = params.id;

  const { data, error } = await supabaseServer
    .from("messages")
    .select("id, direction, text, created_at")
    .eq("chat_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, messages: data });

  
}