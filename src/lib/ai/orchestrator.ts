import OpenAI from "openai";
import { executeAiTool, ToolContext } from "./toolHandler";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * AI Tool Configuration injected into the OpenAI request.
 * Mirrors the definitions supported by toolHandler.ts
 */
const AI_TOOLS = [
    {
        type: "function" as const,
        function: {
            name: "get_store_info",
            description: "Consulta se a loja está aberta e os seus horários de funcionamento e endereço.",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "search_product_catalog",
            description: "Busca produtos no cardápio.",
            parameters: {
                type: "object",
                properties: { category: { type: "string", description: "Filtro opcional: 'principal', 'bebida', 'adicional'" } },
                required: [],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "calculate_cart_total",
            description: "Calcula o subtotal, frete, descontos e total do pedido atual.",
            parameters: {
                type: "object",
                properties: {
                    items: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: { product_id: { type: "string" }, quantity: { type: "integer" } },
                            required: ["product_id", "quantity"],
                        },
                    },
                    cupom_code: { type: "string" },
                    customer_address: { type: "string" },
                },
                required: ["items"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "submit_final_order",
            description: "Finaliza e salva o pedido oficialmente. Gera um webhook para a cozinha.",
            parameters: {
                type: "object",
                properties: {
                    chat_id: { type: "string" },
                    items: { type: "array", items: { type: "object", properties: { product_id: { type: "string" }, quantity: { type: "integer" } } } },
                    subtotal: { type: "number" },
                    discount: { type: "number" },
                    delivery_fee: { type: "number" },
                    total: { type: "number" },
                    payment_method: { type: "string", description: "'pix', 'dinheiro' ou 'cartao'" },
                    change_for: { type: "number", description: "Valor de troco caso dinheiro" },
                    address_number: { type: "string", description: "Número da casa. OBRIGATÓRIO." },
                    address_reference: { type: "string" },
                    gps_location: { type: "string", description: "Ex: '-23.5505,-46.6333' ou string formatada." },
                },
                required: ["items", "payment_method", "address_number"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "get_pix_payment",
            description: "Pega a chave PIX e o valor do restaurante para enviar ao cliente.",
            parameters: {
                type: "object",
                properties: { amount: { type: "number" }, chat_id: { type: "string" } },
                required: ["amount"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "schedule_proactive_followup",
            description: "Agenda uma mensagem para o futuro (abandono de carrinho, pesquisa satisfação).",
            parameters: {
                type: "object",
                properties: {
                    minutes_delay: { type: "number" },
                    intent: { type: "string", description: "'abandoned_cart', 'follow_up', etc." },
                },
                required: ["minutes_delay", "intent"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "send_uaz_carousel",
            description: "Envia um Carrossel no WhatsApp do cliente.",
            parameters: {
                type: "object",
                properties: {
                    phone: { type: "string" },
                    products: {
                        type: "array",
                        items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, image_url: { type: "string" }, price: { type: "number" }, product_id: { type: "string" } } },
                    },
                },
                required: ["products"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "send_uaz_list_menu",
            description: "Envia um Menu em Lista fluida no WhatsApp.",
            parameters: {
                type: "object",
                properties: {
                    phone: { type: "string" },
                    title: { type: "string" },
                    button_text: { type: "string" },
                    sections: { type: "array", items: { type: "object" } },
                },
                required: ["title", "button_text", "sections"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "request_user_location",
            description: "Pede ativamente a localização GPS do cliente através de um botão interativo da Uazapi.",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "move_kanban_stage",
            description: "Move o cliente visualmente no seu painel interno Kanban.",
            parameters: {
                type: "object",
                properties: {
                    chat_id: { type: "string" },
                    stage_name: { type: "string" },
                },
                required: ["stage_name"],
            },
        },
    },
];

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
async function sendTextMessageToUazapi(waChatId: string, instanceName: string | undefined, text: string) {
    if (!instanceName || !process.env.UAZAPI_GLOBAL_API_KEY) {
        console.warn("[AI LOOP] Missing Uazapi credentials for plain text response.");
        return;
    }

    // Obter o token da instância via DB para enviar a msg (exemplo simplificado)
    const supabase = await createSupabaseServerClient();
    const { data: rest } = await supabase.from("restaurants").select("uaz_instance_token").eq("id", "restaurantId").maybeSingle();

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
        .select("stage_id, kanban_status, metadata, cupom_ganho")
        .eq("id", params.chatId)
        .single();

    if (!messages) return;

    // Convert history to OpenAI format (older first)
    messages.reverse();
    const openaiHistory: any[] = messages.map(m => ({
        role: m.direction === "in" ? "user" : "assistant",
        content: m.text || "[Mídia omitida]",
    }));

    // Inject System Prompt
    const systemPrompt = {
        role: "system",
        content: `Você é um Assistente de Delivery de IA do FoodSpin.
Você deve atender de forma humanizada, natural, e focar em conversão de vendas.
Contexto atual do cliente:
- Kanban Stage: ${chatContext?.kanban_status}
- Cupom ganho: ${chatContext?.cupom_ganho || "Nenhum"}
Use as ferramentas fornecidas para consultar cardápio, calcular carrinho, ou enviar mensagens interativas (Carrossel, etc). Se a tool_call falhar ou der erro, explique ao cliente.`,
    };

    const conversationContext = [systemPrompt, ...openaiHistory];

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
        while (loopActive && iteration < MAX_ITERATIONS) {
            iteration++;
            console.log(`[AI LOOP] Thinking... Iteration ${iteration}`);

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini", // Vendas foca em velocidade (mini ok) ou gpt-4o
                messages: conversationContext,
                tools: AI_TOOLS,
                tool_choice: "auto",
                temperature: 0.7,
            });

            const responseMessage = response.choices[0].message;
            conversationContext.push(responseMessage); // Add assistant response to history

            if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
                // OpenAI decided to use tools
                for (const toolCall of responseMessage.tool_calls) {
                    console.log(`[AI LOOP] Executing tool: ${toolCall.function.name}`);

                    const args = JSON.parse(toolCall.function.arguments);
                    const toolResultString = await executeAiTool(toolCall.function.name, args, ctx);
                    const parsedResult = JSON.parse(toolResultString);

                    // ─── INTERCEPT RICHS UI (Uazapi) ───
                    // If the tool returns a prepared Uazapi payload, send it straight out.
                    if (parsedResult.uazapi_payload) {
                        await sendRichPayloadToUazapi(parsedResult.uazapi_payload, params.instanceName);
                        // Tell AI it was sent so it doesn't repeat itself
                        conversationContext.push({
                            tool_call_id: toolCall.id,
                            role: "tool",
                            name: toolCall.function.name,
                            content: JSON.stringify({ ok: true, note: "Interactive visual message sent successfully to user WhatsApp. You do not need to repeat this text." })
                        });
                    } else {
                        // Regular data response (e.g. database query, calculation)
                        conversationContext.push({
                            tool_call_id: toolCall.id,
                            role: "tool",
                            name: toolCall.function.name,
                            content: toolResultString,
                        });
                    }
                }
                // Loop loops back to let OpenAI process the `role: "tool"` responses.
            } else if (responseMessage.content) {
                // OpenAI produced the final natural text response
                loopActive = false;

                const finalAnswer = responseMessage.content;
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
                await sendTextMessageToUazapi(params.waChatId, params.instanceName, finalAnswer);
            }
        }

        if (iteration >= MAX_ITERATIONS) {
            console.warn(`[AI LOOP] Reached loop limit (${MAX_ITERATIONS}) for ChatID: ${params.chatId}. Stopping to prevent infinite loops.`);
        }

    } catch (err) {
        console.error("[AI LOOP] Critical Error:", err);
    }
}
