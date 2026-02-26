import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { triggerFiqonWebhook } from "@/lib/fiqon-webhook";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const chatId = resolvedParams.id;
        const body = await req.json();
        const { stageId, stageName } = body;

        if (!stageId || !stageName) {
            return NextResponse.json({ ok: false, error: "Missing stageId or stageName" }, { status: 400 });
        }

        const supabase = await createSupabaseServerClient();

        // Ensure user is authenticated
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
        }

        // Update the chat's kanban_status
        const { error: updateError } = await supabase
            .from("chats")
            .update({
                kanban_status: stageName,
                updated_at: new Date().toISOString()
            })
            .eq("id", chatId);

        if (updateError) {
            return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
        }

        // Trigger Fiqon Webhook as fire-and-forget (do not await)
        triggerFiqonWebhook(chatId, stageId);

        return NextResponse.json({ ok: true, message: "Ok, Webhook configurado" });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
    }
}
