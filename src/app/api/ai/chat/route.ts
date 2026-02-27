import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import OpenAI from "openai";
import { executeAiTool, ToolContext } from "@/lib/ai/toolHandler";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { messages, restaurant_id, chat_id, wa_chat_id } = body;

        // 1. Validations
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ ok: false, error: "OPENAI_API_KEY_NOT_CONFIGURED" }, { status: 500 });
        }

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ ok: false, error: "invalid_messages_array" }, { status: 400 });
        }

        // We require context to run our custom tools safely
        if (!restaurant_id || !chat_id) {
            return NextResponse.json({ ok: false, error: "missing_restaurant_or_chat_id" }, { status: 400 });
        }

        // 2. Load Tools Definition from Filesystem
        const toolsFilePath = path.join(process.cwd(), "src", "lib", "ai", "tools.json");
        let toolsConfig = [];
        try {
            const rawTools = await fs.readFile(toolsFilePath, "utf-8");
            toolsConfig = JSON.parse(rawTools);
        } catch (err: any) {
            console.error("[api/ai/chat] Failed to load tools.json", err.message);
            return NextResponse.json({ ok: false, error: "failed_to_load_tools_config" }, { status: 500 });
        }

        // 3. Initialize OpenAI and Context
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        // The tool context required by our existing toolHandler.ts
        const ctx: ToolContext = {
            restaurant_id,
            wa_chat_id: wa_chat_id || "unknown", // fallback if not provided
            chat_id,
            base_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        };

        const conversationLog = [...messages]; // We will mutate this array during the tool loop
        const executedToolsDebug: any[] = []; // Collect data to send back to the frontend

        // 4. OpenAI Function Calling Loop (max 5 iterations)
        const MAX_STEPS = 5;
        let currentStep = 0;
        let loopActive = true;
        let finalOutputText = "";

        while (loopActive && currentStep < MAX_STEPS) {
            currentStep++;
            console.log(`[api/ai/chat] Iteration ${currentStep}...`);

            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o-mini", // Or gpt-4o depending on needs
                messages: conversationLog,
                tools: toolsConfig,
                tool_choice: "auto",
                temperature: 0.7,
            });

            const responseMessage = aiResponse.choices[0].message;
            conversationLog.push(responseMessage); // Save assistant's reply/tool_call request into history

            // If the model wants to call tools
            if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {

                for (const toolCall of responseMessage.tool_calls as any[]) {
                    console.log(`[api/ai/chat] Executing tool: ${toolCall.function.name}`);

                    const toolName = toolCall.function.name;
                    const toolArgsString = toolCall.function.arguments;

                    // Security: Verify toolName exists in tools.json before invoking
                    const isToolValid = toolsConfig.some((t: any) => t.function.name === toolName);

                    let toolResultString = "";

                    if (!isToolValid) {
                        console.warn(`[api/ai/chat] Invalid tool execution attempt: ${toolName}`);
                        toolResultString = JSON.stringify({ error: `Tool ${toolName} does not exist.` });
                    } else {
                        try {
                            // Parse args safely
                            const argsObj = JSON.parse(toolArgsString);

                            // Execute relying on our safe executeAiTool handler
                            toolResultString = await executeAiTool(toolName, argsObj, ctx);

                            executedToolsDebug.push({
                                step: currentStep,
                                tool: toolName,
                                arguments: argsObj,
                                result: JSON.parse(toolResultString) // Assuming toolResultString is always valid JSON
                            });
                        } catch (execErr: any) {
                            console.error(`[api/ai/chat] Tool Execution Error (${toolName}):`, execErr);
                            toolResultString = JSON.stringify({ error: `Execution failed: ${execErr.message}` });
                        }
                    }

                    // Append the tool response back to the conversation array
                    conversationLog.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: toolName,
                        content: toolResultString,
                    });
                }

                // The loop iterates again, sending the updated conversationLog back to OpenAI

            } else if (responseMessage.content) {
                // The model produced a standard text response. We break the loop.
                loopActive = false;
                finalOutputText = responseMessage.content;
            }
        }

        if (currentStep >= MAX_STEPS && loopActive) {
            console.warn(`[api/ai/chat] Loop reached max steps (${MAX_STEPS}) without concluding.`);
            finalOutputText = "O agente precisou de tempo extra para concluir a tarefa. (Limite de iterações atingido).";
        }

        // 5. Build Final Response
        return NextResponse.json({
            ok: true,
            text: finalOutputText,
            debug: {
                steps_taken: currentStep,
                tool_calls: executedToolsDebug,
                final_conversation_context: process.env.NODE_ENV === "development" ? conversationLog : undefined
            }
        }, { status: 200 });

    } catch (error: any) {
        console.error("[api/ai/chat] Internal error:", error);
        return NextResponse.json({ ok: false, error: error.message || "Unknown error" }, { status: 500 });
    }
}
