-- Auth profiles baseline (run manually in Supabase SQL editor)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

alter table public.profiles
  add column if not exists email_verified boolean not null default false;

alter table public.profiles
  add column if not exists email_verified_at timestamptz null;

alter table public.profiles
  add column if not exists created_at timestamptz not null default now();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();
