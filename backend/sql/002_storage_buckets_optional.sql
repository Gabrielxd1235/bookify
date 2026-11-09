-- OPTIONAL: Prefer creating these buckets through Supabase Dashboard > Storage.
-- Run in SQL Editor only if your Supabase setup permits bucket creation here.
-- Public visibility is intentional: these assets are profile/business display
-- images, never identity documents or sensitive account files.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('bookify-avatars', 'bookify-avatars', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('bookify-business-media', 'bookify-business-media', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- DO NOT add anonymous INSERT/UPDATE/DELETE policies to storage.objects.
-- Uploads happen only through authenticated backend routes using server credentials.
