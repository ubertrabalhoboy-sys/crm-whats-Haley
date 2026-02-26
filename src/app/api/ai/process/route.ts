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

        const openAiApiKey = process.env.OPENAI_API_KEY;
        if (!openAiApiKey) {
            return NextResponse.json({ ok: false, error: "Falta configurar a chave da OpenAI no painel" }, { status: 400 });
        }

        let textOutput = "";

        try {
            const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${openAiApiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: historyText }
                    ],
                    temperature: 0.7,
                })
            });

            if (!aiResponse.ok) {
                const errorData = await aiResponse.json();
                console.error("[api/ai/process] OpenAI API Error:", errorData);
                throw new Error("Erro na comunicação com a API da OpenAI");
            }

            const data = await aiResponse.json();
            textOutput = data.choices[0].message.content;
        } catch (apiError: any) {
            console.error("[api/ai/process] Fetch error:", apiError);
            return NextResponse.json({ ok: false, error: "Falha ao processar com IA externa: " + apiError.message }, { status: 502 });
        }

        return NextResponse.json({ ok: true, output: textOutput }, { status: 200 });

    } catch (err: any) {
        console.error("[api/ai/process] error", err);
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
