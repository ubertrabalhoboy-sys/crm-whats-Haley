-- Create base tables for onboarding (run manually in Supabase SQL editor)

create extension if not exists pgcrypto;

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
