ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS signature_url text;
