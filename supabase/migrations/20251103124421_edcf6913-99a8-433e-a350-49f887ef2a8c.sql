-- Fix function search path for vendas_totais_por_mes
-- This addresses the security warning about mutable search_path

CREATE OR REPLACE FUNCTION public.vendas_totais_por_mes(mes_arg text, ano_arg integer)
RETURNS TABLE(produto text, total numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT produto, SUM(quantidade) AS total
  FROM public.vendas
  WHERE mes = mes_arg AND ano = ano_arg
  GROUP BY produto
  ORDER BY total DESC, produto ASC;
$$;