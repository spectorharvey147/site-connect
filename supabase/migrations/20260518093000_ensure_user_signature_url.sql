-- Ensure uploaded user signatures are persisted for vouchers.
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS signature_url text;
