import { createSupabaseServerClient } from "@/lib/supabase/server";
import KanbanBoard from "@/components/kanban/KanbanBoard";

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
  const chatList: Chat[] = (chats ?? []).map((c) => ({
    ...c,
    contacts: Array.isArray(c.contacts) ? c.contacts[0] : c.contacts,
  })) as Chat[];

  return <KanbanBoard stageList={stageList} chatList={chatList} restaurantId={restaurantId} />;
}
