import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Body = {
  name?: string;
  vertical?: string;
};

type RestaurantVertical = "burger" | "acai" | "pizza" | "sushi" | "generic";

function normalizeVertical(value: unknown): RestaurantVertical | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "burger" ||
    normalized === "acai" ||
    normalized === "pizza" ||
    normalized === "sushi" ||
    normalized === "generic"
  ) {
    return normalized;
  }
  return null;
}

function inferVerticalFromRestaurantName(name: string): RestaurantVertical {
  const normalized = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/(acai|creme|tigela)/.test(normalized)) return "acai";
  if (/(pizza|pizzaria|calabresa|marguerita|brotinho|gigante)/.test(normalized)) return "pizza";
  if (/(sushi|temaki|uramaki|hossomaki|sashimi|nigiri)/.test(normalized)) return "sushi";
  if (/(burger|hamburg|smash|x-|lanche)/.test(normalized)) return "burger";
  return "generic";
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  }

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .insert({ name })
    .select("id")
    .single();

  if (restaurantError || !restaurant) {
    return NextResponse.json(
      { ok: false, error: restaurantError?.message || "restaurant_create_failed" },
      { status: 500 }
    );
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      restaurant_id: restaurant.id,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }

  const requestedVertical = normalizeVertical(body.vertical);
  const fixedVertical = requestedVertical || inferVerticalFromRestaurantName(name);
  const allowBebida = fixedVertical === "acai" ? false : true;

  const { error: playbookOverrideError } = await supabase
    .from("restaurant_ai_playbook_overrides")
    .upsert(
      {
        restaurant_id: restaurant.id,
        fixed_vertical: fixedVertical,
        allow_principal: true,
        allow_adicional: true,
        allow_bebida: allowBebida,
      },
      { onConflict: "restaurant_id" }
    );

  if (playbookOverrideError) {
    const errorCode = String(playbookOverrideError.code || "");
    const errorMessage = String(playbookOverrideError.message || "").toLowerCase();
    const overrideTableMissing =
      errorCode === "42P01" ||
      (errorMessage.includes("restaurant_ai_playbook_overrides") &&
        errorMessage.includes("does not exist"));

    if (!overrideTableMissing) {
      console.warn("[onboarding] playbook override upsert failed", {
        restaurantId: restaurant.id,
        errorCode,
        errorMessage,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        restaurant_id: restaurant.id,
        playbook_override: {
          created: false,
          reason: overrideTableMissing ? "TABLE_NOT_MIGRATED" : "UPSERT_FAILED",
        },
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      restaurant_id: restaurant.id,
      playbook_override: {
        created: true,
        fixed_vertical: fixedVertical,
        allow_principal: true,
        allow_adicional: true,
        allow_bebida: allowBebida,
      },
    },
    { status: 200 }
  );
}
