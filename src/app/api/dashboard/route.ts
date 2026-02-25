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

    // 1. Fetch Chats for metrics computation
    const { data: chats, error: chatsError } = await supabase
        .from("chats")
        .select("valor_total_vendas, origem_lead")
        .eq("restaurant_id", profile.restaurant_id);

    if (chatsError) {
        return NextResponse.json({ ok: false, error: chatsError.message }, { status: 500 });
    }

    // 2. Fetch Top Promo Products
    // Assuming the top products are just the recently added ones or we just show them in a list.
    const { data: produtos, error: produtosError } = await supabase
        .from("produtos_promo")
        .select("*")
        .eq("restaurant_id", profile.restaurant_id)
        .order("created_at", { ascending: false })
        .limit(10);

    if (produtosError) {
        return NextResponse.json({ ok: false, error: produtosError.message }, { status: 500 });
    }

    const chatsList = chats || [];

    // Metrics calculation
    // Faturamento Zap
    const faturamentoZap = chatsList.reduce((acc, chat) => acc + (Number(chat.valor_total_vendas) || 0), 0);

    // Economia iFood (27% do Faturamento Zap)
    const economiaIfood = faturamentoZap * 0.27;

    // Leads da Roleta (origem_lead == 'roleta' ou não nulo)
    const roletaLeads = chatsList.filter(chat => chat.origem_lead === 'roleta' || chat.origem_lead !== null).length;

    // Taxa de Conversão: (Chats com vendas / Total de Leads) * 100.
    const chatsComVenda = chatsList.filter(chat => (Number(chat.valor_total_vendas) || 0) > 0).length;
    const taxaConversao = chatsList.length > 0 ? (chatsComVenda / chatsList.length) * 100 : 0;

    return NextResponse.json({
        ok: true,
        metrics: {
            faturamentoZap,
            economiaIfood,
            roletaLeads,
            taxaConversao,
            chatsComVenda,
            totalLeads: chatsList.length
        },
        topProdutos: produtos || []
    }, { status: 200 });
}
