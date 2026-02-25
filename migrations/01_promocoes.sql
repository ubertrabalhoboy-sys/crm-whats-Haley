-- 1. Criação da Tabela produtos_promo
create table if not exists public.produtos_promo (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  nome text not null,
  preco_original numeric(10,2) not null,
  preco_promo numeric(10,2) not null,
  estoque integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ativar RLS (Row Level Security) para a nova tabela
alter table public.produtos_promo enable row level security;

-- Política de leitura: donos de restaurante podem ver seus próprios produtos promocionais
create policy "Enable read access for authenticated users by restaurant_id"
  on public.produtos_promo for select
  to authenticated
  using (
    restaurant_id in (
      select p.restaurant_id from public.profiles p where p.id = auth.uid()
    )
  );

-- Política de inserção: donos de restaurante podem inserir seus próprios produtos
create policy "Enable insert access for authenticated users by restaurant_id"
  on public.produtos_promo for insert
  to authenticated
  with check (
    restaurant_id in (
      select p.restaurant_id from public.profiles p where p.id = auth.uid()
    )
  );

-- Política de atualização: donos de restaurante podem atualizar seus próprios produtos
create policy "Enable update access for authenticated users by restaurant_id"
  on public.produtos_promo for update
  to authenticated
  using (
    restaurant_id in (
      select p.restaurant_id from public.profiles p where p.id = auth.uid()
    )
  );

-- Política de deleção (opcional): donos de restaurante podem deletar
create policy "Enable delete access for authenticated users by restaurant_id"
  on public.produtos_promo for delete
  to authenticated
  using (
    restaurant_id in (
      select p.restaurant_id from public.profiles p where p.id = auth.uid()
    )
  );

-- 2. Atualização da Tabela chats (Adicionando os campos para a Gamificação/Fiqon)
alter table public.chats
  add column if not exists cupom_ganho text,
  add column if not exists valor_total_vendas numeric(10,2) default 0,
  add column if not exists origem_lead text;

-- FIM DO SCRIPT
