-- Migration: Add imagem_url column to produtos_promo table
-- Adiciona a coluna para armazenar a URL da imagem do produto (Gamificação/Roleta)

ALTER TABLE public.produtos_promo ADD COLUMN IF NOT EXISTS imagem_url text;
