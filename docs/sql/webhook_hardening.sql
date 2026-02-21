alter table if exists public.messages
  add column if not exists wa_message_id text;

create unique index if not exists messages_wa_message_id_uq
  on public.messages (wa_message_id);
