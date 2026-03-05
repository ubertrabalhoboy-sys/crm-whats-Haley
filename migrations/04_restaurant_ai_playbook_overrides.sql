create table if not exists public.restaurant_ai_playbook_overrides (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  fixed_vertical text,
  allow_principal boolean,
  allow_adicional boolean,
  allow_bebida boolean,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint restaurant_ai_playbook_overrides_vertical_check
    check (fixed_vertical is null or fixed_vertical in ('burger', 'acai', 'pizza', 'sushi', 'generic'))
);

alter table public.restaurant_ai_playbook_overrides enable row level security;

drop policy if exists "Enable read access for authenticated users by restaurant_id (playbook_overrides)"
  on public.restaurant_ai_playbook_overrides;
create policy "Enable read access for authenticated users by restaurant_id (playbook_overrides)"
  on public.restaurant_ai_playbook_overrides
  for select
  to authenticated
  using (
    restaurant_id in (
      select p.restaurant_id from public.profiles p where p.id = auth.uid()
    )
  );

drop policy if exists "Enable insert access for authenticated users by restaurant_id (playbook_overrides)"
  on public.restaurant_ai_playbook_overrides;
create policy "Enable insert access for authenticated users by restaurant_id (playbook_overrides)"
  on public.restaurant_ai_playbook_overrides
  for insert
  to authenticated
  with check (
    restaurant_id in (
      select p.restaurant_id from public.profiles p where p.id = auth.uid()
    )
  );

drop policy if exists "Enable update access for authenticated users by restaurant_id (playbook_overrides)"
  on public.restaurant_ai_playbook_overrides;
create policy "Enable update access for authenticated users by restaurant_id (playbook_overrides)"
  on public.restaurant_ai_playbook_overrides
  for update
  to authenticated
  using (
    restaurant_id in (
      select p.restaurant_id from public.profiles p where p.id = auth.uid()
    )
  );

drop policy if exists "Enable delete access for authenticated users by restaurant_id (playbook_overrides)"
  on public.restaurant_ai_playbook_overrides;
create policy "Enable delete access for authenticated users by restaurant_id (playbook_overrides)"
  on public.restaurant_ai_playbook_overrides
  for delete
  to authenticated
  using (
    restaurant_id in (
      select p.restaurant_id from public.profiles p where p.id = auth.uid()
    )
  );
