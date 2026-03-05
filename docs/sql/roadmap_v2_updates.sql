-- ==========================================
-- AI Roadmap 2.0 Database Updates
-- Adicionando Sentimento e Rastreio de Atividade
-- ==========================================

-- 1. Adicionando coluna de sentimento ao chat
ALTER TABLE public.chats
ADD COLUMN IF NOT EXISTS sentiment VARCHAR(50) DEFAULT 'Neutro';

-- 2. Adicionando timestamp para o cron de carrinho abandonado
ALTER TABLE public.chats
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Atualiza os registros existentes
UPDATE public.chats
SET last_activity_at = updated_at
WHERE last_activity_at IS NULL;
