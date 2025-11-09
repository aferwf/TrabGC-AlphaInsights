
-- Migration: 20251101035002

-- Migration: 20251101033426
-- Create a table for storing uploaded file metadata
CREATE TABLE IF NOT EXISTS public.uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create an index on uploaded_at for faster queries
CREATE INDEX IF NOT EXISTS idx_uploaded_files_uploaded_at ON public.uploaded_files(uploaded_at DESC);

-- Enable Row Level Security
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to read files (public access)
CREATE POLICY "Allow public read access to uploaded files"
ON public.uploaded_files
FOR SELECT
USING (true);

-- Create policy to allow anyone to insert files (public access)
CREATE POLICY "Allow public insert access to uploaded files"
ON public.uploaded_files
FOR INSERT
WITH CHECK (true);

-- Create policy to allow anyone to delete files (public access)
CREATE POLICY "Allow public delete access to uploaded files"
ON public.uploaded_files
FOR DELETE
USING (true);

-- Create storage bucket for uploaded spreadsheets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'spreadsheets',
  'spreadsheets',
  true,
  20971520, -- 20MB limit
  ARRAY[
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy to allow public uploads
CREATE POLICY "Allow public uploads to spreadsheets bucket"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'spreadsheets');

-- Create storage policy to allow public reads
CREATE POLICY "Allow public reads from spreadsheets bucket"
ON storage.objects
FOR SELECT
USING (bucket_id = 'spreadsheets');

-- Create storage policy to allow public deletes
CREATE POLICY "Allow public deletes from spreadsheets bucket"
ON storage.objects
FOR DELETE
USING (bucket_id = 'spreadsheets');


-- Migration: 20251101041856
-- Create vendas table to store parsed sales rows from spreadsheets
CREATE TABLE IF NOT EXISTS public.vendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mes TEXT NOT NULL,
  ano INTEGER NOT NULL,
  produto TEXT NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  valor NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vendas_mes_ano ON public.vendas (mes, ano);
CREATE INDEX IF NOT EXISTS idx_vendas_produto ON public.vendas (produto);
CREATE INDEX IF NOT EXISTS idx_vendas_storage_path ON public.vendas (storage_path);

-- Enable RLS
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;

-- Public read access (non-sensitive aggregate data)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'vendas' AND policyname = 'Allow public read access to vendas'
  ) THEN
    CREATE POLICY "Allow public read access to vendas"
      ON public.vendas FOR SELECT
      USING (true);
  END IF;
END $$;

-- Optional: do not allow public insert/update/delete
-- (Edge function uses service role for writes)

-- Aggregation function for deterministic totals per month
CREATE OR REPLACE FUNCTION public.vendas_totais_por_mes(
  mes_arg TEXT,
  ano_arg INTEGER
)
RETURNS TABLE (
  produto TEXT,
  total NUMERIC
) AS $$
  SELECT produto, SUM(quantidade) AS total
  FROM public.vendas
  WHERE mes = mes_arg AND ano = ano_arg
  GROUP BY produto
  ORDER BY total DESC, produto ASC;
$$ LANGUAGE sql STABLE;

