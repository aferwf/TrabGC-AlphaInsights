-- 1. Add user_id column to vendas table
ALTER TABLE public.vendas 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Create index for performance
CREATE INDEX idx_vendas_user_mes ON public.vendas(user_id, mes, ano);

-- 3. Update the function to filter by user_id
CREATE OR REPLACE FUNCTION public.vendas_totais_por_mes(mes_arg text, ano_arg integer, user_id_arg uuid)
 RETURNS TABLE(produto text, total numeric)
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT produto, SUM(quantidade) AS total
  FROM public.vendas
  WHERE mes = mes_arg 
    AND ano = ano_arg 
    AND user_id = user_id_arg
  GROUP BY produto
  ORDER BY total DESC, produto ASC;
$function$;

-- 4. Update RLS policies to use user_id directly
DROP POLICY IF EXISTS "Users can view own sales data" ON public.vendas;
DROP POLICY IF EXISTS "Users can insert own sales data" ON public.vendas;
DROP POLICY IF EXISTS "Users can delete own sales data" ON public.vendas;

CREATE POLICY "Users can view own sales data" 
ON public.vendas 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sales data" 
ON public.vendas 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sales data" 
ON public.vendas 
FOR DELETE 
USING (auth.uid() = user_id);