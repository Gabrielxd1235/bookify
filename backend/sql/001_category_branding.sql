-- BOOKIFY | Safe, additive category branding migration
-- Run in Supabase SQL Editor after backing up the database.
BEGIN;
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS icon_key text DEFAULT 'tag',
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS image_url text;

UPDATE public.categories
SET icon_key = CASE
  WHEN lower(name) IN ('barberías','barberias','barbershops') THEN 'scissors'
  WHEN lower(name) IN ('salones de belleza','beauty salons') THEN 'sparkles'
  WHEN lower(name) IN ('spas','spa') THEN 'leaf'
  WHEN lower(name) IN ('centros de masajes','massage centers') THEN 'heart'
  WHEN lower(name) IN ('gimnasios','gyms') THEN 'star'
  ELSE 'tag'
END
WHERE icon_key IS NULL OR icon_key = 'tag';
COMMIT;
