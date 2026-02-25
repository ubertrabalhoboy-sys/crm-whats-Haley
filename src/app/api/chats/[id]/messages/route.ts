import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const res = NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    const res = NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
  }

  const restaurantId = profile?.restaurant_id ?? null;

  if (!restaurantId) {
    const res = NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
  }

  const { id } = await context.params;

  // Pagination parameters
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor"); // Timestamp to fetch older messages
  const limit = parseInt(searchParams.get("limit") || "30", 10);

  let query = supabase
    .from("messages")
    .select("id, direction, text, created_at, status")
    .eq("chat_id", id)
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false }) // Fetch descending so we get newest first when limiting
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: messages, error } = await query;

  if (error) {
    const res = NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
  }

  // We fetched descending to get the most recent N items.
  // Re-sort ascending to match chat flow expectations.
  const sortedMessages = (messages ?? []).reverse();

  const res = NextResponse.json({ ok: true, messages: sortedMessages }, { status: 200 });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}
