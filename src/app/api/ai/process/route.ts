import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { messages, tipo_acao } = body;

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ ok: false, error: "invalid_messages_array" }, { status: 400 });
        }

        if (!["suggest", "summarize"].includes(tipo_acao)) {
            return NextResponse.json({ ok: false, error: "invalid_tipo_acao" }, { status: 400 });
        }

        // 1. Prepare Content for the AI
        const historyText = messages
            .slice(-10) // Limit to last 10
            .map((m: any) => `${m.direction === "in" ? "Cliente" : "Atendente"}: ${m.text || ""}`)
            .join("\n");

        const systemPrompt = tipo_acao === "suggest"
            ? "Você é um atendente de restaurante educado e focado em vendas. Ajude a criar uma sugestão de resposta persuasiva e amigável para o cliente baseada no histórico da conversa."
            : "Você é um assistente analítico. Gere um resumo em tópicos curtos sobre do que se trata esta conversa, listando intenção do cliente e produtos citados.";

        // --------------------------------------------------------------------------------
        // TODO: REPLACE THIS BLOCK WITH THE ACTUAL AI FETCH CALL (OpenAI, Evolution API, etc.)
        // --------------------------------------------------------------------------------

        // const aiResponse = await fetch("YOUR_AI_ENDPOINT", { ... })
        // const textOutput = await aiResponse.json()

        // MOCK RESPONSE FOR FRONTEND TESTING:
        await new Promise((resolve) => setTimeout(resolve, 1500)); // simulate network delay

        let textOutput = "";
        if (tipo_acao === "suggest") {
            textOutput = "Olá! Claro, vi que você se interessou. Posso confirmar o seu pedido com a entrega grátis aproveitando a nossa promoção exclusiva de hoje?";
        } else {
            textOutput = "📌 Resumo:\n• Cliente interessado no cardápio.\n• Perguntou sobre taxas de entrega.\n• Demonstrou interesse na promoção de combos.\n⚠️ Ação pendente: Confirmar endereço de entrega.";
        }
        // --------------------------------------------------------------------------------

        return NextResponse.json({ ok: true, output: textOutput }, { status: 200 });

    } catch (err: any) {
        console.error("[api/ai/process] error", err);
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
