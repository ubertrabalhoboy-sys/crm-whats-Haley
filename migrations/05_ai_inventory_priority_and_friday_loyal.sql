-- Roadmap v3.0 - Parte 1 (infraestrutura de dados segura)
-- Objetivo:
-- 1) Tornar o catalogo consciente de prioridade e validade.
-- 2) Disponibilizar RPC para campanha "Fome de Sexta".

alter table public.produtos_promo
  add column if not exists stock_quantity integer,
  add column if not exists is_priority boolean,
  add column if not exists expiration_date timestamp with time zone;

update public.produtos_promo
set stock_quantity = coalesce(stock_quantity, greatest(coalesce(estoque, 999), 0))
where stock_quantity is null;

update public.produtos_promo
set is_priority = false
where is_priority is null;

alter table public.produtos_promo
  alter column stock_quantity set default 999;

alter table public.produtos_promo
  alter column is_priority set default false;

create index if not exists idx_produtos_promo_rest_priority_stock
  on public.produtos_promo (restaurant_id, is_priority desc, stock_quantity desc);

create index if not exists idx_produtos_promo_rest_expiration
  on public.produtos_promo (restaurant_id, expiration_date asc nulls last);

create index if not exists idx_orders_rest_chat_created_at
  on public.orders (restaurant_id, chat_id, created_at desc);

create or replace function public.get_friday_loyal_customers(
  p_restaurant_id uuid,
  p_min_orders integer default 2,
  p_window_days integer default 30
)
returns table (
  restaurant_id uuid,
  chat_id uuid,
  wa_chat_id text,
  friday_order_count bigint,
  last_order_at timestamp with time zone,
  last_item_name text
)
language sql
stable
as $$
  with friday_stats as (
    select
      o.restaurant_id,
      o.chat_id,
      count(*) as friday_order_count,
      max(o.created_at) as last_order_at
    from public.orders o
    where o.restaurant_id = p_restaurant_id
      and extract(dow from (o.created_at at time zone 'America/Sao_Paulo')) = 5
      and o.created_at >= now() - make_interval(days => greatest(p_window_days, 1))
    group by o.restaurant_id, o.chat_id
    having count(*) >= greatest(p_min_orders, 1)
  )
  select
    fs.restaurant_id,
    c.id as chat_id,
    c.wa_chat_id,
    fs.friday_order_count,
    fs.last_order_at,
    coalesce(last_order_item.last_item_name, 'Pedido recente') as last_item_name
  from friday_stats fs
  join public.chats c
    on c.id = fs.chat_id
   and c.restaurant_id = fs.restaurant_id
  left join lateral (
    select
      coalesce(
        (o2.items::jsonb -> 0 ->> 'name'),
        (o2.items::jsonb -> 0 ->> 'title'),
        (o2.items::jsonb -> 0 ->> 'product_name')
      ) as last_item_name
    from public.orders o2
    where o2.restaurant_id = fs.restaurant_id
      and o2.chat_id = fs.chat_id
    order by o2.created_at desc
    limit 1
  ) as last_order_item on true
  order by fs.last_order_at desc;
$$;
