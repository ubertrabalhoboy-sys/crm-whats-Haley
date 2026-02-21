import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runAutomations } from "@/lib/automations/engine";

export const runtime = "nodejs";

type TestBody = {
  chat_id?: string;
  trigger?: string;
  fingerprint?: string;
  context?: Record<string, unknown>;
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }

  const restaurantId = profile?.restaurant_id ?? null;
  if (!restaurantId) {
    return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 });
  }

  let body: TestBody = {};
  try {
    body = (await req.json()) as TestBody;
  } catch {
    body = {};
  }

  if (!body.chat_id || !body.trigger) {
    return NextResponse.json({ ok: false, error: "MISSING_CHAT_OR_TRIGGER" }, { status: 400 });
  }

  const fingerprint =
    body.fingerprint || `test:${body.trigger}:${body.chat_id}:${Math.floor(Date.now() / 1000)}`;

  const result = await runAutomations({
    restaurant_id: restaurantId,
    chat_id: body.chat_id,
    trigger: body.trigger,
    fingerprint,
    context: body.context ?? {},
  });

  return NextResponse.json({ ok: true, result }, { status: 200 });
}

