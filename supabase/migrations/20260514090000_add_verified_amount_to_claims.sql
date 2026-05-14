ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS verified_amount NUMERIC;

UPDATE public.claims
SET verified_amount = grand_total
WHERE verified_amount IS NULL;

