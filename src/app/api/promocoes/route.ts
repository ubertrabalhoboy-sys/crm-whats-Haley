import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const { data: profile } = await supabase
        .from("profiles")
        .select("restaurant_id")
        .eq("id", user.id)
        .maybeSingle();

    if (!profile?.restaurant_id) {
        return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 });
    }

    // Support ?category=bebida filter for AI upsell
    const category = req.nextUrl.searchParams.get("category");

    let query = supabase
        .from("produtos_promo")
        .select("*")
        .eq("restaurant_id", profile.restaurant_id)
        .order("created_at", { ascending: false });

    if (category && ["principal", "bebida", "adicional"].includes(category)) {
        query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, products: data ?? [] }, { status: 200 });
}

export async function POST(req: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const { data: profile } = await supabase
        .from("profiles")
        .select("restaurant_id")
        .eq("id", user.id)
        .maybeSingle();

    if (!profile?.restaurant_id) {
        return NextResponse.json({ ok: false, error: "RESTAURANT_NOT_SET" }, { status: 409 });
    }

    const body = await req.json();
    const { id, nome, description, preco_original, preco_promo, estoque, imagem_url, category, is_extra } = body;

    if (!nome || typeof preco_original !== 'number' || typeof preco_promo !== 'number') {
        return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 });
    }

    let data, error;

    if (id) {
        // UPDATE existing product
        ({ data, error } = await supabase
            .from("produtos_promo")
            .update({
                nome,
                description: description || null,
                preco_original,
                preco_promo,
                estoque: estoque || 0,
                imagem_url: imagem_url || null,
                category: category || "principal",
                is_extra: is_extra || false,
            })
            .eq("id", id)
            .eq("restaurant_id", profile.restaurant_id)
            .select()
            .single());
    } else {
        // INSERT new product
        ({ data, error } = await supabase
            .from("produtos_promo")
            .insert({
                restaurant_id: profile.restaurant_id,
                nome,
                description: description || null,
                preco_original,
                preco_promo,
                estoque: estoque || 0,
                imagem_url: imagem_url || null,
                category: category || "principal",
                is_extra: is_extra || false,
            })
            .select()
            .single());
    }

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, product: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });

    const { error } = await supabase
        .from("produtos_promo")
        .delete()
        .eq("id", id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true }, { status: 200 });
}
