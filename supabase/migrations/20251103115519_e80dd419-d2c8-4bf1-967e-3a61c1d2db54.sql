-- Add user_id column to uploaded_files for ownership tracking
ALTER TABLE public.uploaded_files 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop existing public RLS policies on uploaded_files
DROP POLICY IF EXISTS "Allow public read access to uploaded files" ON public.uploaded_files;
DROP POLICY IF EXISTS "Allow public insert access to uploaded files" ON public.uploaded_files;
DROP POLICY IF EXISTS "Allow public delete access to uploaded files" ON public.uploaded_files;

-- Create secure RLS policies for uploaded_files (authenticated users only)
CREATE POLICY "Users can view own files"
  ON public.uploaded_files FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upload files"
  ON public.uploaded_files FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own files"
  ON public.uploaded_files FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Drop existing public policy on vendas
DROP POLICY IF EXISTS "Allow public read access to vendas" ON public.vendas;

-- Create secure policy for vendas (authenticated users can view their own data)
CREATE POLICY "Users can view own sales data"
  ON public.vendas FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.uploaded_files
      WHERE uploaded_files.storage_path = vendas.storage_path
      AND uploaded_files.user_id = auth.uid()
    )
  );

-- Make spreadsheets storage bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'spreadsheets';

-- Create RLS policies for storage (authenticated access only)
CREATE POLICY "Users can view own files in storage"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'spreadsheets' AND
    EXISTS (
      SELECT 1 FROM public.uploaded_files
      WHERE uploaded_files.storage_path = storage.objects.name
      AND uploaded_files.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can upload files to storage"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'spreadsheets' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete own files from storage"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'spreadsheets' AND
    EXISTS (
      SELECT 1 FROM public.uploaded_files
      WHERE uploaded_files.storage_path = storage.objects.name
      AND uploaded_files.user_id = auth.uid()
    )
  );