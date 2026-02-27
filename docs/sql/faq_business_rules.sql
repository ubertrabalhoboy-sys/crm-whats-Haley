-- Adiciona a coluna business_rules na tabela restaurants
-- Servirá como RAG context/FAQ (Base de Conhecimento Dinâmica) para as perguntas livres dos clientes

ALTER TABLE public.restaurants
ADD COLUMN IF NOT EXISTS business_rules text;

-- Exemplo de como você pode popular depois (opcional):
/*
UPDATE public.restaurants
SET business_rules = 'ENTREGAS E BAIRROS:
- Entregamos apenas na Vila Nova, Centro e Estação.
- Taxa fixa para a Vila Nova é R$ 5,00. Restante R$ 8,00.

 INGREDIENTES E ALERGIAS:
- A maionese verde da casa NÃO tem alho (receita especial apenas com ervas e limão).
- Contém Glúten em todos os lanches (Não há opções sem glúten).

 FERIADOS E FUNCIONAMENTO ESPECIAL:
- Feriados Nacionais nós NÃO fechamos, abrimos das 18h as 23h.
- Fechamos apenas no Natal e Ano Novo.
'
WHERE id = 'sua-uuid-aqui';
*/
