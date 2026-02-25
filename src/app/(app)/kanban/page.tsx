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
  <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
    {/* Pattern sutil de fundo */}
    <div className="pointer-events-none absolute inset-0 opacity-[0.04] [filter:hue-rotate(160deg)_saturate(0.5)] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat" />

    {/* Header premium */}
    <div className="mb-8 flex items-center justify-between rounded-[2.5rem] border border-white/70 bg-white/60 px-8 py-6 shadow-xl backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#086788] text-white shadow-lg shadow-cyan-500/20">
          <span className="text-lg font-black">K</span>
        </div>
        <div>
          <h1 className="text-3xl font-[950] uppercase tracking-tighter text-[#086788] leading-none">
            Kanban
          </h1>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-[#07a0c3]">
            Gestão de leads azul esverdeado
          </p>
        </div>
      </div>

      {/* Botões do header (apenas visual - sem funções novas) */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[#07a0c3] shadow-sm transition-colors hover:bg-cyan-50"
        >
          Notificações
        </button>

        <button
          type="button"
          className="rounded-2xl bg-white/10 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#086788] backdrop-blur-md border border-white/20 shadow-lg transition-all duration-500 active:scale-95 hover:bg-[#07a0c3]/10 hover:border-[#07a0c3]/30"
        >
          Adicionar Chat
        </button>
      </div>
    </div>

    {/* Board horizontal */}
    <div className="flex gap-6 overflow-x-auto pb-4 px-2">
      {stageList.map((stage) => {
        const stageChats = chatList.filter(
          (chat) => (chat.kanban_status ?? "") === stage.name
        );

        return (
          <div key={stage.id} className="w-80 shrink-0 flex flex-col gap-6">
            {/* Cabeçalho da coluna */}
            <div className="flex items-center justify-between rounded-[2rem] border border-white/70 bg-white/55 px-6 py-5 shadow-lg shadow-[#086788]/5 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-[#07a0c3] shadow-[0_0_8px_#07a0c3]" />
                <h2 className="text-[12px] font-[900] uppercase tracking-[0.15em] text-[#086788]">
                  {stage.name}
                </h2>
              </div>

              <span className="rounded-xl bg-[#086788] px-3 py-1 text-[10px] font-black text-white shadow-lg shadow-[#086788]/20">
                {stageChats.length}
              </span>
            </div>

            {/* Lista de cards */}
            <div className="flex-grow space-y-4 overflow-y-auto pr-2 [scrollbar-width:thin]">
              {stageChats.length === 0 ? (
                <div className="rounded-[2.5rem] border-2 border-dashed border-[#086788]/10 p-10 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#086788]/30">
                    Vazio
                  </p>
                </div>
              ) : (
                stageChats.map((chat) => (
                  <div
                    key={chat.id}
                    className="group relative overflow-hidden rounded-[2.2rem] border border-white bg-white/80 p-6 shadow-sm transition-all duration-500 hover:-translate-y-[5px] hover:shadow-2xl backdrop-blur-lg"
                  >
                    {/* Indicador lateral */}
                    <div className="absolute left-0 top-1/4 bottom-1/4 w-1 rounded-r-full bg-[#07a0c3] opacity-0 transition-all group-hover:opacity-100" />

                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#07a0c3] to-[#086788] text-sm font-black text-white shadow-md">
                        {(chat.contacts?.name?.trim()?.charAt(0) ||
                          chat.contacts?.phone?.trim()?.charAt(0) ||
                          "C")}
                      </div>

                      <button
                        type="button"
                        className="rounded-xl p-2 text-slate-300 transition-all hover:bg-cyan-50 hover:text-[#07a0c3]"
                        aria-label="Mais ações"
                      >
                        ⋯
                      </button>
                    </div>

                    <p className="truncate text-[14px] font-[900] uppercase tracking-tight text-[#086788]">
                      {chatTitle(chat)}
                    </p>

                    <div className="mt-1 flex items-center gap-2 text-[#07a0c3]/70">
                      <span className="text-[10px] font-bold tracking-widest">
                        {chat.contacts?.phone || "Sem número"}
                      </span>
                    </div>

                    <div className="mt-4 rounded-[1.5rem] border border-[#086788]/5 bg-[#f0f8f9] p-4">
                      <p className="line-clamp-2 text-[12px] italic leading-relaxed text-slate-600">
                        "{chat.last_message?.trim() || "Sem última mensagem"}"
                      </p>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                      <span className="text-[10px] font-black uppercase tracking-tighter text-slate-400">
                        {formatDate(chat.updated_at)}
                      </span>

                      <div className="flex gap-1">
                        <div
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#07a0c3]"
                          style={{ animationDelay: "0ms" }}
                        />
                        <div
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#07a0c3]"
                          style={{ animationDelay: "150ms" }}
                        />
                        <div
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#07a0c3]"
                          style={{ animationDelay: "300ms" }}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}

      {stageList.length === 0 && (
        <div className="rounded-[2.5rem] border-2 border-dashed border-slate-200/70 bg-white/60 p-8 text-sm text-slate-600 backdrop-blur-xl">
          Nenhum estágio cadastrado em <code>kanban_stages</code>.
        </div>
      )}
    </div>
  </div>
);
          })}
        </div>
      </div>
    </div>
  );
}


