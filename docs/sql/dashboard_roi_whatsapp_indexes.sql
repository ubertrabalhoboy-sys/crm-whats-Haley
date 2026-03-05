-- Dashboard ROI + WhatsApp Health indexing
-- Safe to run multiple times.

-- 1) Dedupe rápido de alertas warning (usado no /api/whatsapp/status)
create index if not exists idx_notifications_warning_dedupe
on public.notifications (restaurant_id, created_at desc, title, message)
where type = 'warning' and is_read = false;

-- 2) ROI: runs de recuperação de carrinho (filtro trigger/status + janela por data)
create index if not exists idx_automation_runs_recovery_success
on public.automation_runs (restaurant_id, created_at desc, chat_id)
where trigger = 'abandoned_cart_recovery' and status = 'success';

-- 3) ROI: pedidos por chat/tempo para atribuição de receita recuperada
create index if not exists idx_orders_restaurant_chat_created
on public.orders (restaurant_id, chat_id, created_at desc);

-- 4) ROI: turnos de IA para estimativa de horas economizadas
do $$
begin
    if to_regclass('public.ai_turn_metrics') is not null then
        execute 'create index if not exists idx_ai_turn_metrics_restaurant_created_outcome
                 on public.ai_turn_metrics (restaurant_id, created_at desc, outcome)';
    end if;
end $$;
