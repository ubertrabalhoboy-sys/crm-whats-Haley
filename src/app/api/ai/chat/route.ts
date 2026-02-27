import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import { executeAiTool, ToolContext } from "@/lib/ai/toolHandler";
import { mapOpenAIToolsToGemini } from "@/lib/ai/geminiMapper";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { messages, restaurant_id, chat_id, wa_chat_id } = body;

        // 1. Validations
        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ ok: false, error: "GEMINI_API_KEY_NOT_CONFIGURED" }, { status: 500 });
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

        // 3. Initialize Gemini and Context
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const GEMINI_TOOLS = mapOpenAIToolsToGemini(toolsConfig);

        // The tool context required by our existing toolHandler.ts
        const ctx: ToolContext = {
            restaurant_id,
            wa_chat_id: wa_chat_id || "unknown", // fallback if not provided
            chat_id,
            base_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        };

        // Separate system messages from the history for systemInstruction
        const systemMessages = messages.filter((m: any) => m.role === "system").map((m: any) => m.content).join("\n\n");
        const chatHistory: Content[] = messages
            .filter((m: any) => m.role !== "system")
            .map((m: any) => ({
                role: m.role === "user" ? "user" : "model",
                parts: [{ text: m.content || "" }]
            }));

        const conversationLog = [...chatHistory]; // We will mutate this array during the tool loop
        const executedToolsDebug: any[] = []; // Collect data to send back to the frontend

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: systemMessages || undefined,
            tools: [{ functionDeclarations: GEMINI_TOOLS }],
        });

        // 4. Gemini Function Calling Loop (max 5 iterations)
        const MAX_STEPS = 5;
        let currentStep = 0;
        let loopActive = true;
        let finalOutputText = "";

        while (loopActive && currentStep < MAX_STEPS) {
            currentStep++;
            console.log(`[api/ai/chat] Iteration ${currentStep}...`);

            const aiResponse = await model.generateContent({
                contents: conversationLog
            });

            const responseMessage = aiResponse.response;
            const functionCalls = responseMessage.functionCalls();

            // If the model wants to call tools
            if (functionCalls && functionCalls.length > 0) {
                const functionResponses: any[] = [];

                // Save model's tool calls into history
                conversationLog.push({
                    role: "model",
                    parts: functionCalls.map(fc => ({ functionCall: fc }))
                });

                for (const toolCall of functionCalls) {
                    console.log(`[api/ai/chat] Executing tool: ${toolCall.name}`);

                    const toolName = toolCall.name;
                    const toolArgsObj = toolCall.args;

                    // Security: Verify toolName exists in tools.json before invoking
                    const isToolValid = toolsConfig.some((t: any) => t.function.name === toolName);

                    let toolResultString = "";

                    if (!isToolValid) {
                        console.warn(`[api/ai/chat] Invalid tool execution attempt: ${toolName}`);
                        toolResultString = JSON.stringify({ error: `Tool ${toolName} does not exist.` });
                    } else {
                        try {
                            // Execute relying on our safe executeAiTool handler
                            toolResultString = await executeAiTool(toolName, toolArgsObj as any, ctx);

                            executedToolsDebug.push({
                                step: currentStep,
                                tool: toolName,
                                arguments: toolArgsObj,
                                result: JSON.parse(toolResultString)
                            });
                        } catch (execErr: any) {
                            console.error(`[api/ai/chat] Tool Execution Error (${toolName}):`, execErr);
                            toolResultString = JSON.stringify({ error: `Execution failed: ${execErr.message}` });
                        }
                    }

                    // Append the tool response back to the responses array
                    functionResponses.push({
                        functionResponse: {
                            name: toolName,
                            response: JSON.parse(toolResultString)
                        }
                    });
                }

                // Add the function responses back to the conversation array
                conversationLog.push({
                    role: "function",
                    parts: functionResponses
                });

            } else {
                // The model produced a standard text response. We break the loop.
                const answer = responseMessage.text();
                if (answer) {
                    loopActive = false;
                    finalOutputText = answer;
                }
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
