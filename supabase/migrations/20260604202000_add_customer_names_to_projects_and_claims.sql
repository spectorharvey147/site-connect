ALTER TABLE public.app_lists
  ADD COLUMN IF NOT EXISTS customer_names TEXT[] DEFAULT '{}';

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS customer_name TEXT;

ALTER TABLE public.expense_items
  ADD COLUMN IF NOT EXISTS customer_name TEXT;

NOTIFY pgrst, 'reload schema';
