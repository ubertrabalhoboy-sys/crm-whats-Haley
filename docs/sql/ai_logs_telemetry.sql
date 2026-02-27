-- Cria a tabela de observabilidade (Raio-X da Inteligência Artificial)
-- Serve para monitorar os gastos de tokens do Gemini, lentidão (latência) e o que ele está decidindo em cada etapa do webhook.

CREATE TABLE IF NOT EXISTS public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  chat_id uuid references public.chats(id) on delete set null,
  wa_chat_id text,
  model text not null,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  duration_ms integer,
  error_message text,
  created_at timestamptz not null default now()
);

-- Habilitar RLS
ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

-- Policy (donos de restaurante podem ler os logs do seu próprio chatbot)
CREATE POLICY ai_logs_tenant_select
ON public.ai_logs
FOR SELECT
USING (
  restaurant_id = (
    SELECT p.restaurant_id FROM public.profiles p WHERE p.id = auth.uid()
  )
);
