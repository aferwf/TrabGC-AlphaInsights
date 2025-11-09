-- Fix 1: Make user_id NOT NULL (constraint already exists)
ALTER TABLE uploaded_files 
ALTER COLUMN user_id SET NOT NULL;

-- Fix 2: Drop legacy public storage policies that override secure policies
DROP POLICY IF EXISTS "Allow public reads from spreadsheets bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to spreadsheets bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from spreadsheets bucket" ON storage.objects;

-- Fix 3: Add INSERT and DELETE policies for vendas table to enable RLS enforcement
CREATE POLICY "Users can insert own sales data"
  ON vendas FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM uploaded_files
      WHERE uploaded_files.storage_path = vendas.storage_path
      AND uploaded_files.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own sales data"
  ON vendas FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uploaded_files
      WHERE uploaded_files.storage_path = vendas.storage_path
      AND uploaded_files.user_id = auth.uid()
    )
  );