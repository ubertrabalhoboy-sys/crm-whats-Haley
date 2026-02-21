-- Automations MVP schema (safe, additive only)
-- NOTE: run manually on Supabase SQL editor. This file is NOT executed automatically.

create extension if not exists pgcrypto;

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  template_text text not null,
  variables jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  stage_id uuid null,
  trigger text not null default 'button_clicked',
  enabled boolean not null default true,
  action_type text not null default 'send_template',
  template_text text null,
  delay_seconds integer not null default 0,
  only_if jsonb null,
  run_once_per_chat boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_actions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  order_index integer not null default 0,
  action_type text not null default 'send_template',
  template_id uuid null references public.message_templates(id) on delete set null,
  delay_seconds integer not null default 0,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  automation_id uuid null references public.automations(id) on delete set null,
  chat_id uuid not null references public.chats(id) on delete cascade,
  trigger text null,
  fingerprint text null,
  status text not null default 'queued',
  error text null,
  context jsonb null,
  created_at timestamptz not null default now(),
  executed_at timestamptz null
);

create table if not exists public.automation_run_locks (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (restaurant_id, automation_id, chat_id)
);

-- Additive changes only (if tables already existed with partial schema)
alter table if exists public.automations
  add column if not exists trigger text not null default 'button_clicked',
  add column if not exists stage_id uuid null,
  add column if not exists only_if jsonb null,
  add column if not exists run_once_per_chat boolean not null default false,
  add column if not exists action_type text not null default 'send_template',
  add column if not exists template_text text null,
  add column if not exists delay_seconds integer not null default 0;

alter table if exists public.automation_actions
  add column if not exists restaurant_id uuid,
  add column if not exists order_index integer not null default 0,
  add column if not exists action_type text not null default 'send_template',
  add column if not exists template_id uuid null,
  add column if not exists delay_seconds integer not null default 0,
  add column if not exists payload jsonb default '{}'::jsonb;

alter table if exists public.automation_runs
  add column if not exists trigger text null,
  add column if not exists fingerprint text null,
  add column if not exists context jsonb null;

create index if not exists message_templates_restaurant_idx
  on public.message_templates (restaurant_id);

create index if not exists automations_restaurant_trigger_idx
  on public.automations (restaurant_id, trigger, enabled);

create index if not exists automation_actions_automation_idx
  on public.automation_actions (automation_id, order_index);

create index if not exists automation_runs_restaurant_idx
  on public.automation_runs (restaurant_id, created_at desc);

create index if not exists automation_runs_fingerprint_idx
  on public.automation_runs (restaurant_id, fingerprint);

