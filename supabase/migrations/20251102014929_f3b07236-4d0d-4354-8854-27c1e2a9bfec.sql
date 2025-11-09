-- Adicionar colunas faltantes na tabela vendas
ALTER TABLE public.vendas 
ADD COLUMN IF NOT EXISTS data timestamp with time zone,
ADD COLUMN IF NOT EXISTS id_transacao text,
ADD COLUMN IF NOT EXISTS categoria text,
ADD COLUMN IF NOT EXISTS regiao text,
ADD COLUMN IF NOT EXISTS preco_unitario numeric,
ADD COLUMN IF NOT EXISTS receita_total numeric;

-- Renomear coluna valor para manter consistência (se ainda não foi renomeada)
-- valor será usado como alias para preco_unitario na leitura antiga
-- mas vamos manter as duas colunas por compatibilidade