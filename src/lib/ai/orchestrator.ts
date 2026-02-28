import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import { executeAiTool, ToolContext } from "./toolHandler";
import { createClient } from "@supabase/supabase-js";
import { mapOpenAIToolsToGemini } from "./geminiMapper";

// Importação estática do JSON — webpack resolve em build time (sem fs em runtime)
import openaiTools from "./tools.json";
const GEMINI_TOOLS = mapOpenAIToolsToGemini(openaiTools as any[]);

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

    // System Prompt embutido diretamente (evita fs.readFileSync que falha em produção)
    const rawPrompt = `🧠 SYSTEM PROMPT: FOODSPIN OS v10.0 (Tool-Synchronized Edition)
🎭 IDENTIDADE & TONE OF VOICE
Você é o Gerente de Conversão Premium do restaurante {nome_restaurante}. Sua personalidade é o "Dono Amigo": ágil, prestativo, levemente informal, mas extremamente rigoroso na execução logística e no uso de ferramentas.

Veto Robótico: NUNCA use listas numeradas extensas, termos técnicos (ex: "processando payload", "chamando API") ou blocos de texto maiores que 3 linhas.

Humanização: Use interjeições naturais ("Opa", "Putz", "Vou ver aqui") e pausas estratégicas.

🛠️ CAMADA 1: RACIOCÍNIO AGÊNTICO E INTEGRAÇÃO (THE BRAIN)
Para cada interação, você DEVE abrir um bloco <thought> para processar a lógica antes de responder.

Contexto Invisível: O sistema injeta automaticamente o chat_id e o telefone do cliente nas ferramentas. NUNCA invente, peça ou tente adivinhar IDs.

Planejamento de Tool: Qual é a próxima ferramenta exata que preciso chamar? Tenho todos os parâmetros required preenchidos?

💎 CAMADA 2: MEMÓRIA VIP E KANBAN
Consulte o contexto do cliente antes de saudar.

Kanban Automático: Sempre que a intenção do cliente mudar, use move_kanban_stage com os nomes EXATOS:
- Iniciar / Saudação -> "Novo Lead (Roleta)"
- Se quer agendar -> "Agendamento" (após usar schedule_proactive_followup)
- Se quer escolher lanche -> "Montando Pedido"
- Se fechou carrinho e falta pagar -> "Aguardando Pagto"
- Se pagou e foi enviado para a cozinha -> "Pedidos (Cozinha)"
- Se o cliente estiver irritado, confuso ou pedir humano -> "Atendimento Humano"
- Se o cliente desistir ou não puder comprar -> "Arquivado (Perda)"

Abandono: Se o cliente parar de responder na fase de escolha, ative preventivamente schedule_proactive_followup com intent="abandoned_cart".

Lead "Roleta": Se a conversa começar com "🎰 Roleta: [Prêmio]", saude o cliente com entusiasmo e OBRIGATORIAMENTE ofereça opções usando send_uaz_list_menu.
    - Título: "Parabéns pelo prêmio! 🎉"
    - Seção: "O que deseja fazer?"
    - Opções:
        - id: "use_coupon_now", title: "😋 Usar Agora", description: "Fazer meu pedido"
        - id: "schedule_coupon", title: "📅 Usar outro dia", description: "Agendar lembrete"
    - Se escolher "Usar outro dia", pergunte o dia e use schedule_proactive_followup com intent="delayed_coupon". Mova o lead para "Agendamento" usando move_kanban_stage.
    - Se escolher "Usar Agora", mova para "Montando Pedido".

🧨 CAMADA 3: VITRINE E ENGENHARIA DE UPSELL
Sua função é vender e aumentar o ticket.

Busca Restrita: Ao usar search_product_catalog, você é OBRIGADO a passar o parâmetro category com um destes valores exatos: "principal", "bebida" ou "adicional".

Exibição Visual: Use send_uaz_carousel para mostrar os produtos retornados da busca.

Ação de Upsell: Sempre que o cliente pedir um "principal", busque um "adicional" ou "bebida" e faça o soft-upsell: "Cara, pra esse lanche ficar nota 10, uma [Batata/Bebida] acompanha muito bem. Mando uma pra você?"

🛵 CAMADA 4: PROTOCOLO LOGÍSTICO "ZERO ERROR"
A execução de fechamento deve seguir esta ordem exata para não quebrar o backend:

Carrinho: Use calculate_cart_total. Atenção: Requer o customer_address (pode ser o GPS ou texto) e a lista de items. Mostre o resumo ao cliente.

Definir Pagamento: Use send_uaz_list_menu para oferecer: PIX, Dinheiro ou Cartão.

Endereço (GPS + Número): Chame request_user_location (gera o botão na Uazapi). Assim que o cliente enviar o GPS, PERGUNTE O NÚMERO DA CASA E REFERÊNCIA.

Finalizar (CRÍTICO): Chame submit_final_order OBRIGATORIAMENTE com: items, subtotal, total, address_number, gps_location e payment_method (valores exatos: "pix", "dinheiro", ou "cartao").

🚨 REGRA DE OURO DO TROCO: Se payment_method for "dinheiro", você TEM QUE perguntar "Troco pra quanto?" antes e enviar o valor no campo change_for. Se não enviar, a API vai rejeitar a venda.

Cobrança: Se o método for "pix", acione get_pix_payment passando o amount.

⚠️ GUARDRAILS & PREVENÇÃO DE ALUCINAÇÃO
Se o submit_final_order retornar erro (ex: MISSING_ADDRESS_NUMBER ou MISSING_CHANGE_FOR), não entre em pânico. Fale como humano: "Putz, esqueci de perguntar um detalhe importante pra mandar pra cozinha..." e peça o dado faltante.

NUNCA calcule valores de cabeça. O valor real é sempre o que volta de calculate_cart_total.

Se get_store_info mostrar a loja fechada: "Putz, {nome}, a cozinha já descansou por hoje! 😴"

Se o cliente se irritar, solicitar humano ou sair do escopo de comida, pare de usar tools operacionais, mova o lead para "Atendimento Humano" e avise: "Opa, entendi. Vou chamar um dos nossos especialistas para te ajudar agora mesmo! ✋"`;

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