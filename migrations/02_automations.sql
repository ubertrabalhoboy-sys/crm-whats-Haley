-- 02_automations.sql
-- Run this in the Supabase SQL Editor to create the Kanban Automations table

CREATE TABLE IF NOT EXISTS public.automations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stage_id UUID NOT NULL REFERENCES public.kanban_stages(id) ON DELETE CASCADE,
    fiqon_trigger_tag TEXT,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(stage_id)
);

-- Enable RLS
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

-- Policies
-- Leitura permitida para usuários autenticados
CREATE POLICY "Leitura de automacoes permitida para logados" 
ON public.automations FOR SELECT 
TO authenticated USING (true);

-- Insert/Update permitido (Supomos segurança simplificada por enquanto pois a lógica RLS do Kanban é baseada em auth).
-- Para um prod real, cruze com: auth.uid() IN (SELECT ...) onde o kanban pertence ao usuário.
CREATE POLICY "Adicao e edicao permitida" 
ON public.automations FOR ALL 
TO authenticated USING (true) WITH CHECK (true);

-- Trigger to auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_automations_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER tr_automations_updated_at
BEFORE UPDATE ON public.automations
FOR EACH ROW
EXECUTE FUNCTION update_automations_updated_at_column();
