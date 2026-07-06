-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- Bucket name: my-files

-- 1. Enable RLS on the storage.objects table
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing public policies (clean slate)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read own files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own files" ON storage.objects;

-- 3. Policy: Allow authenticated users to upload files
CREATE POLICY "Users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'my-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Policy: Allow users to read only their own files
CREATE POLICY "Users can read own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'my-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. Policy: Allow users to delete only their own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'my-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Note: After running this, you must prefix file paths with auth.uid()
-- In the app, change upload path from: file.name
-- to: `${user.id}/${file.name}`
