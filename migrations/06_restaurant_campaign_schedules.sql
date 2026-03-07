-- Campaign schedules per restaurant (hourly global cron compatible)

create table if not exists public.restaurant_campaign_schedules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  campaign_key text not null check (campaign_key in ('friday_loyal')),
  enabled boolean not null default true,
  weekdays smallint[] not null default '{}'::smallint[],
  hour_local smallint not null default 20 check (hour_local between 0 and 23),
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, campaign_key),
  check (cardinality(weekdays) between 0 and 3)
);

create index if not exists idx_rest_campaign_schedule_lookup
  on public.restaurant_campaign_schedules (campaign_key, enabled, restaurant_id);

alter table public.restaurant_campaign_schedules enable row level security;

drop policy if exists restaurant_campaign_schedules_select on public.restaurant_campaign_schedules;
create policy restaurant_campaign_schedules_select
  on public.restaurant_campaign_schedules
  for select
  using (
    restaurant_id in (
      select p.restaurant_id
      from public.profiles p
      where p.id = auth.uid()
    )
  );

drop policy if exists restaurant_campaign_schedules_insert on public.restaurant_campaign_schedules;
create policy restaurant_campaign_schedules_insert
  on public.restaurant_campaign_schedules
  for insert
  with check (
    restaurant_id in (
      select p.restaurant_id
      from public.profiles p
      where p.id = auth.uid()
    )
  );

drop policy if exists restaurant_campaign_schedules_update on public.restaurant_campaign_schedules;
create policy restaurant_campaign_schedules_update
  on public.restaurant_campaign_schedules
  for update
  using (
    restaurant_id in (
      select p.restaurant_id
      from public.profiles p
      where p.id = auth.uid()
    )
  )
  with check (
    restaurant_id in (
      select p.restaurant_id
      from public.profiles p
      where p.id = auth.uid()
    )
  );

drop policy if exists restaurant_campaign_schedules_delete on public.restaurant_campaign_schedules;
create policy restaurant_campaign_schedules_delete
  on public.restaurant_campaign_schedules
  for delete
  using (
    restaurant_id in (
      select p.restaurant_id
      from public.profiles p
      where p.id = auth.uid()
    )
  );

