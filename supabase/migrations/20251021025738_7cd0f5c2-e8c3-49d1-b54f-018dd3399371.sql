-- Create storage bucket for spreadsheets
INSERT INTO storage.buckets (id, name, public)
VALUES ('spreadsheets', 'spreadsheets', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload spreadsheets
CREATE POLICY "Anyone can upload spreadsheets"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'spreadsheets');

-- Allow authenticated users to view their uploaded spreadsheets
CREATE POLICY "Anyone can view spreadsheets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'spreadsheets');

-- Allow authenticated users to delete spreadsheets
CREATE POLICY "Anyone can delete spreadsheets"
ON storage.objects
FOR DELETE
USING (bucket_id = 'spreadsheets');