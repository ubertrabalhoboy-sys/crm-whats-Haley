import type { ToolContext } from "./toolHandler";
import type { CartSnapshotData } from "./toolRules";

type ChatCouponRow = {
    cupom_ganho?: string | null;
} | null;

type QueryError = {
    message?: string | null;
} | null | undefined;

type ChatsTableClient = {
    select(columns: string): {
        eq(column: string, value: unknown): {
            maybeSingle(): PromiseLike<{ data: ChatCouponRow; error?: QueryError }>;
        };
    };
    update(values: Record<string, unknown>): {
        eq(column: string, value: unknown): {
            eq(column: string, value: unknown): PromiseLike<{ error?: QueryError }>;
        };
    };
};

type ChatsDbClient = {
    from(table: "chats"): unknown;
};

export async function getActiveChatCouponCode(
    db: ChatsDbClient,
    chatId: string | undefined
) {
    if (!chatId) {
        return "";
    }

    const chatsTable = db.from("chats") as ChatsTableClient;
    const { data: chatData } = await chatsTable
        .select("cupom_ganho")
        .eq("id", chatId)
        .maybeSingle();

    return typeof chatData?.cupom_ganho === "string" ? chatData.cupom_ganho.trim() : "";
}

export async function persistChatCartSnapshot(
    db: ChatsDbClient,
    ctx: ToolContext,
    snapshot: CartSnapshotData
) {
    if (!ctx.chat_id) {
        return { ok: false, skipped: true, reason: "MISSING_CHAT_ID" } as const;
    }

    const chatsTable = db.from("chats") as ChatsTableClient;
    const { error } = await chatsTable
        .update({
            cart_snapshot: snapshot,
            updated_at: snapshot.updated_at,
        })
        .eq("id", ctx.chat_id)
        .eq("restaurant_id", ctx.restaurant_id);

    if (error?.message) {
        return { ok: false, skipped: false, reason: error.message } as const;
    }

    return { ok: true, skipped: false } as const;
}
