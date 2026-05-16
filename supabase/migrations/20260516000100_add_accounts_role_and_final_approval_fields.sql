-- Add Accounts as a finance processing role and keep final approval separate from admin verification.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('User', 'Manager', 'Admin', 'Accounts', 'Super Admin'));

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS final_approval_email TEXT,
  ADD COLUMN IF NOT EXISTS final_approval_date TIMESTAMP WITH TIME ZONE;

