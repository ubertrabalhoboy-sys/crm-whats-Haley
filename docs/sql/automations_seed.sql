-- Seed mínimo para testar automação real button_clicked -> send_template
-- Substitua <RESTAURANT_ID> pelo UUID do restaurante antes de executar.

insert into public.automations (
  restaurant_id,
  enabled,
  trigger,
  action_type,
  template_text,
  delay_seconds,
  cooldown_seconds,
  run_once_per_chat,
  only_if
) values (
  '<RESTAURANT_ID>'::uuid,
  true,
  'button_clicked',
  'send_template',
  'Você escolheu {{displayText}} (id={{buttonId}}). Quer ver o cardápio?',
  0,
  0,
  true,
  '{"buttonId":"prod_a"}'::jsonb
);
