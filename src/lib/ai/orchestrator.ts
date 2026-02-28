import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import { executeAiTool, ToolContext } from "./toolHandler";
import { createClient } from "@supabase/supabase-js";
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

// ─── SUPABASE ADMIN CLIENT (Service Role — sem cookies) ───
// O orquestrador roda em background (fire-and-forget), então NÃO pode
// depender de cookies de sessão. Usamos a service_role key.
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
 * Envia uma mensagem de texto simples via Uazapi.
 * Usa o mesmo padrão funcional do engine.ts (automações).
 */
async function sendTextMessage(number: string, text: string, instanceToken: string) {
    const base = process.env.UAZAPI_BASE_URL;
    if (!base || !instanceToken) {
        console.warn("[AI LOOP] sendTextMessage: UAZAPI_BASE_URL or instanceToken missing.");
        return null;
    }

    const cleanNumber = number.split("@")[0].replace(/\D/g, "");
    console.log(`[AI LOOP] Sending text to ${cleanNumber} via ${normalizeBaseUrl(base)}/send/text`);

    const res = await fetch(`${normalizeBaseUrl(base)}/send/text`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "token": instanceToken,
        },
        body: JSON.stringify({ number: cleanNumber, text }),
    });

    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { json = raw; }

    if (!res.ok) {
        console.error(`[AI LOOP] Uazapi send failed (${res.status}):`, json);
        return null;
    }

    console.log("[AI LOOP] Uazapi send OK:", typeof json === "object" ? JSON.stringify(json).substring(0, 100) : raw.substring(0, 100));
    return json;
}

/**
 * Envia Payloads Ricos (Carousel, List, Button) via Uazapi.
 * Os payloads vêm formatados do toolHandler (send_uaz_carousel, send_uaz_list_menu, etc.)
 */
async function sendRichPayload(uazapiPayload: any, instanceToken: string) {
    const base = process.env.UAZAPI_BASE_URL;
    if (!base || !instanceToken) {
        console.warn("[AI LOOP] sendRichPayload: UAZAPI_BASE_URL or instanceToken missing.");
        return null;
    }

    // Detectar o tipo de payload e escolher o endpoint correto
    let endpoint = "/send/text"; // fallback
    if (uazapiPayload.listMessage || uazapiPayload.list) {
        endpoint = "/send/list";
    } else if (uazapiPayload.buttonsMessage || uazapiPayload.buttons) {
        endpoint = "/send/buttons";
    } else if (uazapiPayload.templateMessage || uazapiPayload.template) {
        endpoint = "/send/template";
    }

    console.log(`[AI LOOP] Dispatching Rich UI to ${normalizeBaseUrl(base)}${endpoint}`);

    const res = await fetch(`${normalizeBaseUrl(base)}${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "token": instanceToken,
        },
        body: JSON.stringify(uazapiPayload),
    });

    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { json = raw; }

    if (!res.ok) {
        console.error(`[AI LOOP] Rich payload send failed (${res.status}):`, json);
        return null;
    }

    console.log("[AI LOOP] Rich payload sent OK.");
    return json;
}

/**
 * The main AI Tool Calling Orchestration Loop.
 * Runs independently in the background (fire-and-forget from webhook).
 */
export async function processAiMessage(params: OrchestratorParams) {
    console.log(`[AI LOOP] Started for ChatID: ${params.chatId}`);
    const supabase = getSupabaseAdmin();

    // 0. Obter o token da instância Uazapi para enviar mensagens
    const { data: restData } = await supabase
        .from("restaurants")
        .select("name, uaz_instance_token")
        .eq("id", params.restaurantId)
        .single();

    const instanceToken = restData?.uaz_instance_token || "";
    const restaurantName = restData?.name || "FoodSpin";

    if (!instanceToken) {
        console.error(`[AI LOOP] No uaz_instance_token found for restaurant ${params.restaurantId}. Cannot send messages.`);
        return;
    }

    // 1. Fetch History & Context
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
        .replace(/{nome_restaurante}/g, restaurantName)
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
            model: "gemini-2.5-flash",
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
                model: "gemini-2.5-flash",
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

                    // ─── INTERCEPT RICH UI (Uazapi) ───
                    if (parsedResult.uazapi_payload) {
                        await sendRichPayload(parsedResult.uazapi_payload, instanceToken);
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
                    console.log(`[AI LOOP] Final Answer Ready: "${finalAnswer.substring(0, 80)}..."`);

                    // 1. Send to WhatsApp
                    const sendResult = await sendTextMessage(params.waChatId, finalAnswer, instanceToken);
                    const waMessageId = sendResult?.id || sendResult?.messageId || null;

                    // 2. Save to database
                    await supabase.from("messages").insert({
                        chat_id: params.chatId,
                        restaurant_id: params.restaurantId,
                        direction: "out",
                        text: finalAnswer,
                        wa_message_id: waMessageId,
                        status: "sent"
                    });

                    // 3. Update chat last_message
                    await supabase.from("chats").update({
                        last_message: finalAnswer,
                        updated_at: new Date().toISOString(),
                    }).eq("id", params.chatId);
                }
            }
        } // Fim do while

        // 🛡️ CAMADA 1: Fallback de Limite de Iterações
        if (iteration >= MAX_ITERATIONS) {
            console.warn(`[AI LOOP] Reached loop limit (${MAX_ITERATIONS}) for ChatID: ${params.chatId}.`);

            const fallbackMessage = "Putz, deu um pequeno curto-circuito aqui no meu sistema tentando processar seu pedido! 😅 Você poderia repetir o que deseja, por favor?";

            await sendTextMessage(params.waChatId, fallbackMessage, instanceToken);
            await supabase.from("messages").insert({
                chat_id: params.chatId,
                restaurant_id: params.restaurantId,
                direction: "out",
                text: fallbackMessage,
                status: "sent"
            });
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
            const sendResult = await sendTextMessage(params.waChatId, errorMessage, instanceToken);
            const waMessageId = sendResult?.id || sendResult?.messageId || null;

            // Salvar a mensagem fallback no histórico do banco para aparecer no frontend
            await supabase.from("messages").insert({
                chat_id: params.chatId,
                restaurant_id: params.restaurantId,
                direction: "out",
                text: errorMessage,
                wa_message_id: waMessageId,
                status: "sent"
            });

            // Mover para Atendimento Humano
            await supabase.from("chats").update({
                kanban_status: "Atendimento Humano",
                last_message: errorMessage,
                updated_at: new Date().toISOString(),
            }).eq("id", params.chatId);
        } catch (fallbackErr) {
            console.error("[AI LOOP] Failed to send/save fallback message:", fallbackErr);
        }
    }
} // Fim da função processAiMessage