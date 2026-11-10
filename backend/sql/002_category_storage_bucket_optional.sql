-- Use this only if you prefer SQL over creating the bucket in Supabase Storage UI.
-- The bucket is public for reading images only. Uploads/deletes must go via ADMIN backend.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bookify-category-images', 'bookify-category-images', true,
  5242880, ARRAY['image/jpeg','image/png','image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Deliberately DO NOT add anonymous INSERT/UPDATE/DELETE policies on storage.objects.
-- Our Node.js server uses a server-only Supabase secret key after verifying ADMIN.
