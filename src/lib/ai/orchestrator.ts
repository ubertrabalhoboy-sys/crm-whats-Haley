import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import { executeAiTool, ToolContext } from "./toolHandler";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import fs from "fs";
import path from "path";
import { mapOpenAIToolsToGemini } from "./geminiMapper";

const toolsFilePath = path.join(process.cwd(), "src", "lib", "ai", "tools.json");
const rawTools = fs.readFileSync(toolsFilePath, "utf8");
const openaiTools = JSON.parse(rawTools);
const GEMINI_TOOLS = mapOpenAIToolsToGemini(openaiTools);

type OrchestratorParams = {
    restaurantId: string;
    chatId: string;
    waChatId: string;
    instanceName?: string;
    incomingText: string;
};

/**
 * Envia uma mensagem de texto simples nativa via Uazapi.
 */
async function sendTextMessageToUazapi(waChatId: string, instanceName: string | undefined, text: string, restaurantId: string) {
    if (!instanceName || !process.env.UAZAPI_GLOBAL_API_KEY) {
        console.warn("[AI LOOP] Missing Uazapi credentials for plain text response.");
        return;
    }

    // Obter o token da instância via DB para enviar a msg (exemplo simplificado)
    const supabase = await createSupabaseServerClient();
    const { data: rest } = await supabase.from("restaurants").select("uaz_instance_token").eq("id", restaurantId).maybeSingle();

    // Mock simplificado do endpoint Uazapi:
    await fetch(`https://api.uazapi.com/v1/messages/send`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.UAZAPI_GLOBAL_API_KEY}`,
            "Instance-Token": rest?.uaz_instance_token || ""
        },
        body: JSON.stringify({
            number: waChatId,
            textMessage: { text },
            instanceName,
        })
    }).catch(e => console.error("[AI LOOP] Failed to send to Uazapi:", e));
}

/**
 * Envia Payloads Ricos (Carousel, List, Button) diretamente para a Uazapi
 */
async function sendRichPayloadToUazapi(uazapiPayload: any, instanceName: string | undefined) {
    if (!instanceName || !process.env.UAZAPI_GLOBAL_API_KEY) {
        console.warn("[AI LOOP] Missing Uazapi credentials for rich payload.");
        return;
    }

    // Inject the instanceName as required by the tool architecture
    const payload = { ...uazapiPayload, instanceName };

    console.log("[AI LOOP] Dispatching Rich UI to Uazapi.");
    // Implementation would forward `payload` directly to Uazapi sending endpoint
    // fetch('https://api.uazapi.com/v1/messages/send', { method: 'POST', body: JSON.stringify(payload) })
}

/**
 * The main AI Tool Calling Orchestration Loop.
 * Runs independently in the background (fire-and-forget from webhook).
 */
export async function processAiMessage(params: OrchestratorParams) {
    console.log(`[AI LOOP] Started for ChatID: ${params.chatId}`);
    const supabase = await createSupabaseServerClient();

    // 1. Fetch History & Context
    const { data: messages } = await supabase
        .from("messages")
        .select("direction, text")
        .eq("chat_id", params.chatId)
        .order("created_at", { ascending: false })
        .limit(15);

    const { data: chatContext } = await supabase
        .from("chats")
        .select("stage_id, kanban_status, metadata, cupom_ganho, kanban_stages(name)")
        .eq("id", params.chatId)
        .single();

    const { data: restaurant } = await supabase
        .from("restaurants")
        .select("name")
        .eq("id", params.restaurantId)
        .single();

    if (!messages) return;

    // Convert history to Gemini format (older first)
    messages.reverse();
    const geminiHistory: Content[] = messages.map(m => ({
        role: m.direction === "in" ? "user" : "model",
        parts: [{ text: m.text || "[Mídia omitida]" }],
    }));

    // Inject System Prompt
    const promptPath = path.join(process.cwd(), "src", "lib", "ai", "system_prompt.md");
    let rawPrompt = "";
    try {
        rawPrompt = fs.readFileSync(promptPath, "utf8");
    } catch (e) {
        console.error("[AI LOOP] Failed to read system_prompt.md:", e);
        rawPrompt = `Você é o Gerente de Conversão Premium do {nome_restaurante}.\nKanban Stage: {kanban_status}\nCupom: {cupom_ganho}`;
    }

    const finalPromptContent = rawPrompt
        .replace(/{nome_restaurante}/g, restaurant?.name || "FoodSpin")
        .replace(/{kanban_status}/g, (chatContext?.kanban_stages as any)?.name || chatContext?.kanban_status || "Desconhecido")
        .replace(/{cupom_ganho}/g, chatContext?.cupom_ganho || "Nenhum");

    const conversationContext: Content[] = [...geminiHistory];

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
            model: "gemini-1.5-flash",
            systemInstruction: finalPromptContent,
            tools: [{ functionDeclarations: GEMINI_TOOLS }],
        });

        while (loopActive && iteration < MAX_ITERATIONS) {
            iteration++;
            console.log(`[AI LOOP] Thinking... Iteration ${iteration}`);

            const startTimeMs = Date.now();
            const response = await model.generateContent({
                contents: conversationContext
            });
            const durationMs = Date.now() - startTimeMs;

            const responseMessage = response.response;
            const usage = responseMessage.usageMetadata;

            // 📊 TELEMETRY: Non-blocking log to Supabase ai_logs
            supabase.from("ai_logs").insert({
                restaurant_id: params.restaurantId,
                chat_id: params.chatId,
                wa_chat_id: params.waChatId,
                model: "gemini-1.5-flash",
                prompt_tokens: usage?.promptTokenCount || 0,
                completion_tokens: usage?.candidatesTokenCount || 0,
                total_tokens: usage?.totalTokenCount || 0,
                duration_ms: durationMs
            }).then(({ error }) => {
                if (error) console.error("[TELEMETRY] Failed to insert ai_logs:", error.message);
            });

            const functionCalls = responseMessage.functionCalls();

            if (functionCalls && functionCalls.length > 0) {
                // Gemini decided to use tools
                const functionResponses: any[] = [];

                // Add model's logic/tool requests to history
                conversationContext.push({
                    role: "model",
                    parts: functionCalls.map(fc => ({ functionCall: fc }))
                });

                for (const toolCall of functionCalls) {
                    console.log(`[AI LOOP] Executing tool: ${toolCall.name}`);
                    const args = toolCall.args;
                    const toolResultString = await executeAiTool(toolCall.name, args as any, ctx);
                    const parsedResult = JSON.parse(toolResultString);

                    // ─── INTERCEPT RICHS UI (Uazapi) ───
                    if (parsedResult.uazapi_payload) {
                        await sendRichPayloadToUazapi(parsedResult.uazapi_payload, params.instanceName);
                        // Tell AI it was sent so it doesn't repeat itself
                        functionResponses.push({
                            functionResponse: {
                                name: toolCall.name,
                                response: { ok: true, note: "Interactive visual message sent successfully to user WhatsApp. You do not need to repeat this text." }
                            }
                        });
                    } else {
                        // Regular data response
                        functionResponses.push({
                            functionResponse: {
                                name: toolCall.name,
                                response: parsedResult
                            }
                        });
                    }
                }

                // Append the tool responses back to history
                conversationContext.push({
                    role: "function",
                    parts: functionResponses
                });

            } else {
                // Gemini produced the final natural text response
                const finalAnswer = responseMessage.text();
                if (finalAnswer) {
                    loopActive = false;
                    console.log(`[AI LOOP] Final Answer Ready: "${finalAnswer.substring(0, 50)}..."`);

                    // 1. Save to database
                    await supabase.from("messages").insert({
                        chat_id: params.chatId,
                        restaurant_id: params.restaurantId,
                        direction: "out",
                        text: finalAnswer,
                        status: "sent"
                    });

                    // 2. Dispatch text to WhatsApp
                    await sendTextMessageToUazapi(params.waChatId, params.instanceName, finalAnswer, params.restaurantId);
                }
            }
        } // Fim do while

        // 🛡️ CAMADA 1: Fallback de Limite de Iterações
        if (iteration >= MAX_ITERATIONS) {
            console.warn(`[AI LOOP] Reached loop limit (${MAX_ITERATIONS}) for ChatID: ${params.chatId}.`);

            const fallbackMessage = "Putz, deu um pequeno curto-circuito aqui no meu sistema tentando processar seu pedido! 😅 Você poderia repetir o que deseja, por favor?";

            // Salva no banco e avisa o cliente
            await supabase.from("messages").insert({
                chat_id: params.chatId,
                restaurant_id: params.restaurantId,
                direction: "out",
                text: fallbackMessage,
                status: "sent"
            });
            await sendTextMessageToUazapi(params.waChatId, params.instanceName, fallbackMessage, params.restaurantId);
        }

    } catch (err: any) {
        // 🛡️ CAMADA 2: Fallback de Crash Crítico
        console.error("[AI LOOP] Critical Error:", err);

        // 📊 TELEMETRY: Log AI Failure
        await supabase.from("ai_logs").insert({
            restaurant_id: params.restaurantId,
            chat_id: params.chatId,
            wa_chat_id: params.waChatId,
            model: "gemini-2.5-flash",
            error_message: String(err.message || err),
            duration_ms: 0
        });

        const errorMessage = "Opa, nossa cozinha virtual está passando por uma instabilidade rápida. Já chamei um atendente humano para assumir seu pedido e falar com você, tá bom? 👨‍🍳";

        try {
            // Tenta avisar o cliente da falha crítica
            await sendTextMessageToUazapi(params.waChatId, params.instanceName, errorMessage, params.restaurantId);

            // Tenta mover o cliente no Kanban para "Atenção Manual / Erro" 
            // IMPORTANTE: Substitua o ID fictício abaixo pelo ID real da sua coluna de atendimento humano, ou omita esta linha se não tiver.
            await supabase.from("chats").update({ stage_id: "ID_DO_ESTAGIO_ATENDIMENTO_HUMANO" }).eq("id", params.chatId);
        } catch (fallbackErr) {
            console.error("[AI LOOP] Failed to send fallback message:", fallbackErr);
        }
    }
} // Fim da função processAiMessage