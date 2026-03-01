import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import { executeAiTool, ToolContext } from "./toolHandler";
import { createClient } from "@supabase/supabase-js";
import { mapOpenAIToolsToGemini } from "./geminiMapper";

// Importação estática do JSON — mapeado para o formato Google
import openaiTools from "./tools.json";
const GEMINI_TOOLS = mapOpenAIToolsToGemini(openaiTools as any[]);

type OrchestratorParams = {
    restaurantId: string;
    chatId: string;
    waChatId: string;
    instanceName?: string;
    incomingText: string;
};

function getSupabaseAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

function normalizeBaseUrl(url: string) {
    return url.replace(/\/$/, "");
}

/**
 * 🛡️ Utilitário Atualizado: Garante ordem User -> Model -> User.
 * Se houver mensagens seguidas do mesmo lado (ex: 3 mensagens do cliente),
 * ele CONCATENA os textos para não haver PERDA DE DADOS.
 */
function sanitizeGeminiHistory(history: Content[]): Content[] {
    const sanitized: Content[] = [];

    for (const msg of history) {
        if (sanitized.length === 0) {
            if (msg.role === "user") {
                sanitized.push({ role: msg.role, parts: [{ text: msg.parts[0]?.text || "" }] });
            }
            continue;
        }

        const lastSanitized = sanitized[sanitized.length - 1];

        if (msg.role === lastSanitized.role) {
            const currentText = msg.parts[0]?.text || "";
            if (currentText) {
                lastSanitized.parts[0].text += `\n${currentText}`;
            }
        } else {
            sanitized.push({ role: msg.role, parts: [{ text: msg.parts[0]?.text || "" }] });
        }
    }

    return sanitized;
}

async function sendTextMessage(number: string, text: string, instanceToken: string) {
    const base = process.env.UAZAPI_BASE_URL;
    if (!base || !instanceToken) return null;
    const cleanNumber = number.split("@")[0].replace(/\D/g, "");
    const res = await fetch(`${normalizeBaseUrl(base)}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "token": instanceToken },
        body: JSON.stringify({ number: cleanNumber, text }),
    });
    const raw = await res.text();
    try { return JSON.parse(raw); } catch { return raw; }
}

async function sendRichPayload(uazapiPayload: any, instanceToken: string) {
    const base = process.env.UAZAPI_BASE_URL;
    if (!base || !instanceToken) return null;
    let endpoint = "/send/text";
    if (uazapiPayload.listMessage || uazapiPayload.list) endpoint = "/send/list";
    else if (uazapiPayload.buttonsMessage || uazapiPayload.buttons) endpoint = "/send/buttons";
    else if (uazapiPayload.templateMessage || uazapiPayload.template) endpoint = "/send/template";

    const res = await fetch(`${normalizeBaseUrl(base)}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "token": instanceToken },
        body: JSON.stringify(uazapiPayload),
    });
    const raw = await res.text();
    try { return JSON.parse(raw); } catch { return raw; }
}

export async function processAiMessage(params: OrchestratorParams) {
    console.log(`[AI LOOP] Started for ChatID: ${params.chatId}`);
    const supabase = getSupabaseAdmin();

    const { data: restData } = await supabase
        .from("restaurants")
        .select("name, uaz_instance_token, system_prompt")
        .eq("id", params.restaurantId)
        .single();

    const instanceToken = restData?.uaz_instance_token || "";
    const restaurantName = restData?.name || "FoodSpin";
    if (!instanceToken) return;

    const { data: messages } = await supabase
        .from("messages")
        .select("direction, text")
        .eq("chat_id", params.chatId)
        .order("created_at", { ascending: false })
        .limit(15);

    const { data: chatContext } = await supabase
        .from("chats")
        .select("stage_id, kanban_status, cupom_ganho, kanban_stages(name)")
        .eq("id", params.chatId)
        .single();

    let geminiHistory: Content[] = [];
    if (messages && messages.length > 0) {
        messages.reverse();
        geminiHistory = messages.map(m => ({
            role: m.direction === "in" ? "user" : "model",
            parts: [{ text: m.text || "[Mídia omitida]" }],
        }));
    }

    // ⏱️ Injeção de contexto temporal para auxiliar a decisão da IA
    const diasSemana = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    const agora = new Date();
    // Usa toLocaleString para garantir o fuso horário correto caso o servidor esteja em UTC
    const horaLocal = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    const contextoTemporal = `[Hoje: ${diasSemana[agora.getDay()]}, Hora Atual: ${horaLocal}]`;

    // REGRA DE OURO: Gatilho invisível para Roleta ou preenchimento de input
    if (geminiHistory.length === 0) {
        const triggerText = params.incomingText || `🎰 Roleta: [${chatContext?.cupom_ganho || "Prêmio Ativado"}] ${contextoTemporal}`;
        geminiHistory.push({ role: "user", parts: [{ text: triggerText }] });
    } else if (params.incomingText && geminiHistory[geminiHistory.length - 1].role === "model") {
        geminiHistory.push({ role: "user", parts: [{ text: params.incomingText }] });
    }

    const conversationContext = sanitizeGeminiHistory(geminiHistory);

    const fallbackPrompt = `Você é o Gerente de Conversão Premium do restaurante {nome_restaurante}. Responda de forma curta, amigável e auxilie o cliente com o seu pedido.`;
    const rawPrompt = restData?.system_prompt || fallbackPrompt;

    const finalPromptContent = rawPrompt
        .replace(/{nome_restaurante}/g, restaurantName)
        .replace(/{kanban_status}/g, (chatContext?.kanban_stages as any)?.name || chatContext?.kanban_status || "Desconhecido")
        .replace(/{cupom_ganho}/g, chatContext?.cupom_ganho || "Nenhum");

    const ctx: ToolContext = {
        restaurant_id: params.restaurantId,
        wa_chat_id: params.waChatId,
        chat_id: params.chatId,
        base_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    };

    let loopActive = true;
    let iteration = 0;
    const MAX_ITERATIONS = 5;

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: finalPromptContent,
            tools: [{ functionDeclarations: GEMINI_TOOLS }],
        });

        while (loopActive && iteration < MAX_ITERATIONS) {
            iteration++;
            console.log(`[AI LOOP] Thinking... Iteration ${iteration}`);

            const startTimeMs = Date.now();
            const response = await model.generateContent({ contents: conversationContext });
            const durationMs = Date.now() - startTimeMs;

            const responseMessage = response.response;
            const usage = responseMessage.usageMetadata;

            supabase.from("ai_logs").insert({
                restaurant_id: params.restaurantId,
                chat_id: params.chatId,
                wa_chat_id: params.waChatId,
                model: "gemini-2.5-flash",
                prompt_tokens: usage?.promptTokenCount || 0,
                completion_tokens: usage?.candidatesTokenCount || 0,
                total_tokens: usage?.totalTokenCount || 0,
                duration_ms: durationMs
            }).then(({ error }) => { if (error) console.error("[TELEMETRY] Error:", error.message); });

            const functionCalls = responseMessage.functionCalls();

            if (functionCalls && functionCalls.length > 0) {
                const functionResponses: any[] = [];
                conversationContext.push({
                    role: "model",
                    parts: functionCalls.map(fc => ({ functionCall: fc }))
                });

                for (const toolCall of functionCalls) {
                    console.log(`[AI LOOP] Tool: ${toolCall.name}`);
                    const toolResultString = await executeAiTool(toolCall.name, toolCall.args as any, ctx);
                    const parsedResult = JSON.parse(toolResultString);

                    if (parsedResult.uazapi_payload) {
                        await sendRichPayload(parsedResult.uazapi_payload, instanceToken);
                        functionResponses.push({
                            functionResponse: { name: toolCall.name, response: { ok: true, note: "Rich UI sent." } }
                        });
                    } else {
                        functionResponses.push({
                            functionResponse: { name: toolCall.name, response: parsedResult }
                        });
                    }
                }
                conversationContext.push({ role: "function", parts: functionResponses });
            } else {
                let finalAnswer = responseMessage.text();
                if (finalAnswer) {
                    finalAnswer = finalAnswer.replace(/<thought>[\s\S]*?<\/thought>/g, "").trim();

                    if (!finalAnswer) {
                        console.warn("[AI LOOP] Empty response after stripping thoughts.");
                        iteration++;
                        continue;
                    }

                    loopActive = false;
                    const sendResult = await sendTextMessage(params.waChatId, finalAnswer, instanceToken);
                    const waId = sendResult?.id || sendResult?.messageId || null;

                    await supabase.from("messages").insert({
                        chat_id: params.chatId,
                        restaurant_id: params.restaurantId,
                        direction: "out",
                        text: finalAnswer,
                        wa_message_id: waId,
                        status: "sent"
                    });

                    await supabase.from("chats").update({
                        last_message: finalAnswer,
                        updated_at: new Date().toISOString(),
                    }).eq("id", params.chatId);
                }
            }
        }
    } catch (err: any) {
        console.error("[AI LOOP] Critical Error:", err);
        const errorMessage = "Opa, nossa cozinha virtual está passando por uma instabilidade rápida. Já chamei um atendente humano para assumir seu pedido e falar com você, tá bom? 👨‍🍳";
        await sendTextMessage(params.waChatId, errorMessage, instanceToken);
    }
}