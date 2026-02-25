import { createSupabaseServerClient } from "@/lib/supabase/server";

type Stage = {
  id: string;
  name: string;
};

type Chat = {
  id: string;
  wa_chat_id: string | null;
  kanban_status: string | null;
  updated_at: string | null;
  last_message?: string | null;
  contacts?: { phone: string | null; name: string | null } | null;
};

type ChatRow = Omit<Chat, "contacts"> & {
  contacts: { phone: string | null; name: string | null }[] | null;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function chatTitle(chat: Chat) {
  const name = chat.contacts?.name?.trim();
  const phone = chat.contacts?.phone?.trim();
  return name || phone || chat.wa_chat_id || "Chat";
}

export default async function KanbanPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="wa-card rounded-xl p-6 shadow-xl shadow-emerald-900/5">
        <h1 className="text-xl font-semibold text-slate-900">Kanban</h1>
        <p className="mt-2 text-sm text-rose-600">UNAUTHORIZED</p>
      </div>
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return (
      <div className="wa-card rounded-xl p-6 shadow-xl shadow-emerald-900/5">
        <h1 className="text-xl font-semibold text-slate-900">Kanban</h1>
        <p className="mt-2 text-sm text-rose-600">{profileError.message}</p>
      </div>
    );
  }

  const restaurantId = profile?.restaurant_id ?? null;
  if (!restaurantId) {
    return (
      <div className="wa-card rounded-xl p-6 shadow-xl shadow-emerald-900/5">
        <h1 className="text-xl font-semibold text-slate-900">Kanban</h1>
        <p className="mt-2 text-sm text-amber-600">RESTAURANT_NOT_SET</p>
      </div>
    );
  }

  const { data: stages, error: stagesError } = await supabase
    .from("kanban_stages")
    .select("id, name")
    .eq("restaurant_id", restaurantId)
    .order("name", { ascending: true });

  const { data: chats, error: chatsError } = await supabase
    .from("chats")
    .select("id, wa_chat_id, kanban_status, updated_at, last_message, contacts(phone, name)")
    .eq("restaurant_id", restaurantId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (stagesError || chatsError) {
    return (
      <div className="wa-card rounded-xl p-6 shadow-xl shadow-emerald-900/5">
        <h1 className="text-xl font-semibold text-slate-900">Kanban</h1>
        <p className="mt-2 text-sm text-rose-600">{stagesError?.message || chatsError?.message}</p>
      </div>
    );
  }

  const stageList = (stages ?? []) as Stage[];
  const chatRows = (chats ?? []) as ChatRow[];
  const chatList: Chat[] = chatRows.map((c) => ({
    ...c,
    contacts: c.contacts?.[0] ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="wa-card rounded-2xl p-6 shadow-xl shadow-emerald-900/5">
        <h1 className="text-xl font-semibold text-slate-900">Kanban</h1>
        <p className="mt-2 text-sm text-slate-600">
          Pipeline por estágio com chats do restaurante atual.
        </p>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4">
          {stageList.map((stage) => {
            const stageChats = chatList.filter((chat) => (chat.kanban_status ?? "") === stage.name);

            return (
              <div
                key={stage.id}
                className="w-80 shrink-0 overflow-hidden rounded-2xl border wa-divider wa-glass shadow-[0_10px_24px_rgba(18,140,126,0.06)]"
              >
                <div className="wa-topbar border-b wa-divider px-4 py-3 text-white">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">{stage.name}</h2>
                    <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white/95">
                      {stageChats.length}
                    </span>
                  </div>
                </div>

                <div className="max-h-[65vh] space-y-3 overflow-y-auto p-3">
                  {stageChats.length === 0 ? (
                    <div className="rounded-lg border wa-divider bg-white/35 p-3 text-sm text-slate-600">
                      Sem chats
                    </div>
                  ) : (
                    stageChats.map((chat) => (
                      <div
                        key={chat.id}
                        className="wa-card wa-glow rounded-xl p-3 shadow-sm"
                      >
                        <p className="text-sm font-medium text-slate-900">{chatTitle(chat)}</p>
                        {chat.contacts?.phone && (
                          <p className="mt-1 text-xs text-slate-600">{chat.contacts.phone}</p>
                        )}
                        <p className="mt-2 line-clamp-2 text-sm text-slate-700">
                          {chat.last_message?.trim() || "Sem última mensagem"}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">{formatDate(chat.updated_at)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}

          {stageList.length === 0 && (
            <div className="wa-card rounded-xl border border-dashed wa-divider p-6 text-sm text-slate-600">
              Nenhum estágio cadastrado em `kanban_stages`.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


