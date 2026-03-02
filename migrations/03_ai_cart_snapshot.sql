alter table public.chats
  add column if not exists cart_snapshot jsonb;
