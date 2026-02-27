import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
            .join("\n") || "O cliente acabou de iniciar o atendimento sem mandar texto legível, sugira uma recepção educada.";

        const systemPrompt = tipo_acao === "suggest"
            ? "Você é um atendente de restaurante educado e focado em vendas. Ajude a criar uma sugestão de resposta persuasiva e amigável para o cliente baseada no histórico da conversa."
            : "Você é um assistente analítico. Gere um resumo em tópicos curtos sobre do que se trata esta conversa, listando intenção do cliente e produtos citados.";

        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            return NextResponse.json({ ok: false, error: "Falta configurar a chave da Gemini no painel" }, { status: 400 });
        }

        let textOutput = "";

        try {
            const genAI = new GoogleGenerativeAI(geminiApiKey);
            const model = genAI.getGenerativeModel({
                model: "gemini-1.5-flash",
                systemInstruction: systemPrompt
            });

            const response = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: historyText }] }]
            });

            textOutput = response.response.text();

        } catch (apiError: any) {
            console.error("[api/ai/process] SDK error:", apiError);
            const errMsg = apiError?.message || String(apiError);
            return NextResponse.json({ ok: false, error: "Falha ao processar com IA externa: " + errMsg }, { status: 502 });
        }

        return NextResponse.json({ ok: true, output: textOutput }, { status: 200 });

    } catch (err: any) {
        console.error("[api/ai/process] error", err);
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
