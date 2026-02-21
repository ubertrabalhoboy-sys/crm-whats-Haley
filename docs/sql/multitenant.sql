-- Multi-tenant foundation for CRM Whats
-- Execute manually in Supabase SQL Editor.

begin;

create extension if not exists pgcrypto;

-- 1) Core tables
create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  uaz_instance_id text,
  uaz_instance_token text,
  uaz_status text,
  uaz_phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);

-- 2) Ensure tenant key exists on domain tables
alter table if exists public.chats
  add column if not exists restaurant_id uuid;

alter table if exists public.messages
  add column if not exists restaurant_id uuid;

alter table if exists public.contacts
  add column if not exists restaurant_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chats_restaurant_id_fkey'
  ) then
    alter table public.chats
      add constraint chats_restaurant_id_fkey
      foreign key (restaurant_id) references public.restaurants(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_restaurant_id_fkey'
  ) then
    alter table public.messages
      add constraint messages_restaurant_id_fkey
      foreign key (restaurant_id) references public.restaurants(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'contacts_restaurant_id_fkey'
  ) then
    alter table public.contacts
      add constraint contacts_restaurant_id_fkey
      foreign key (restaurant_id) references public.restaurants(id) on delete restrict;
  end if;
end $$;

-- 3) Backfill (legacy rows with restaurant_id is null)
with seed as (
  insert into public.restaurants (name)
  select 'Default Restaurant'
  where not exists (select 1 from public.restaurants)
  returning id
),
picked as (
  select id from seed
  union all
  select r.id from public.restaurants r order by r.created_at asc limit 1
)
update public.profiles p
set restaurant_id = (select id from picked limit 1)
where p.restaurant_id is null;

with picked as (
  select id from public.restaurants order by created_at asc limit 1
)
update public.chats c
set restaurant_id = coalesce(
  c.restaurant_id,
  (select p.restaurant_id from public.profiles p where p.id = c.user_id limit 1),
  (select id from picked limit 1)
)
where c.restaurant_id is null;

update public.messages m
set restaurant_id = c.restaurant_id
from public.chats c
where m.chat_id = c.id
  and m.restaurant_id is null;

with picked as (
  select id from public.restaurants order by created_at asc limit 1
)
update public.messages m
set restaurant_id = (select id from picked limit 1)
where m.restaurant_id is null;

update public.contacts ct
set restaurant_id = x.restaurant_id
from (
  select c.contact_id, min(c.restaurant_id) as restaurant_id
  from public.chats c
  where c.contact_id is not null
    and c.restaurant_id is not null
  group by c.contact_id
) x
where ct.id = x.contact_id
  and ct.restaurant_id is null;

with picked as (
  select id from public.restaurants order by created_at asc limit 1
)
update public.contacts ct
set restaurant_id = (select id from picked limit 1)
where ct.restaurant_id is null;

-- 4) Enable RLS
alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.contacts enable row level security;

-- 5) Policies
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists restaurants_select_member on public.restaurants;
create policy restaurants_select_member
on public.restaurants
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.restaurant_id = restaurants.id
  )
);

drop policy if exists chats_tenant_select on public.chats;
create policy chats_tenant_select
on public.chats
for select
using (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists chats_tenant_insert on public.chats;
create policy chats_tenant_insert
on public.chats
for insert
with check (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists chats_tenant_update on public.chats;
create policy chats_tenant_update
on public.chats
for update
using (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
)
with check (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists chats_tenant_delete on public.chats;
create policy chats_tenant_delete
on public.chats
for delete
using (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists messages_tenant_select on public.messages;
create policy messages_tenant_select
on public.messages
for select
using (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists messages_tenant_insert on public.messages;
create policy messages_tenant_insert
on public.messages
for insert
with check (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists messages_tenant_update on public.messages;
create policy messages_tenant_update
on public.messages
for update
using (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
)
with check (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists messages_tenant_delete on public.messages;
create policy messages_tenant_delete
on public.messages
for delete
using (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists contacts_tenant_select on public.contacts;
create policy contacts_tenant_select
on public.contacts
for select
using (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists contacts_tenant_insert on public.contacts;
create policy contacts_tenant_insert
on public.contacts
for insert
with check (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists contacts_tenant_update on public.contacts;
create policy contacts_tenant_update
on public.contacts
for update
using (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
)
with check (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists contacts_tenant_delete on public.contacts;
create policy contacts_tenant_delete
on public.contacts
for delete
using (
  restaurant_id = (
    select p.restaurant_id from public.profiles p where p.id = auth.uid()
  )
);

commit;
