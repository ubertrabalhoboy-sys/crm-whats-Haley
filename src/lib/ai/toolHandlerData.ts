import type { ToolContext } from "./toolHandler";
import type { CartSnapshotData } from "./toolRules";

type ChatCouponRow = {
    cupom_ganho?: string | null;
} | null;

type ChatFollowupRow = {
    cart_snapshot?: unknown;
    kanban_status?: string | null;
    cupom_ganho?: string | null;
    last_activity_at?: string | null;
} | null;

type QueryError = {
    message?: string | null;
} | null | undefined;

type ChatsTableClient = {
    select(columns: string): {
        eq(column: string, value: unknown): {
            maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error?: QueryError }>;
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

    const typedChatData = chatData as ChatCouponRow;
    return typeof typedChatData?.cupom_ganho === "string"
        ? typedChatData.cupom_ganho.trim()
        : "";
}

export async function getChatFollowupState(
    db: ChatsDbClient,
    chatId: string | undefined
) {
    if (!chatId) {
        return null;
    }

    const chatsTable = db.from("chats") as ChatsTableClient;
    const { data: chatData } = await chatsTable
        .select("cart_snapshot, kanban_status, cupom_ganho, last_activity_at")
        .eq("id", chatId)
        .maybeSingle();

    return (chatData as ChatFollowupRow) || null;
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
