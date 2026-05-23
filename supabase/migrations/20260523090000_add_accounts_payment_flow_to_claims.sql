ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS accounts_verified_email TEXT,
  ADD COLUMN IF NOT EXISTS accounts_verified_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS accounts_note TEXT,
  ADD COLUMN IF NOT EXISTS paid_email TEXT,
  ADD COLUMN IF NOT EXISTS paid_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_note TEXT;

CREATE INDEX IF NOT EXISTS idx_claims_accounts_status ON public.claims(status)
WHERE status IN ('Accounts Verification', 'Sent to Accounts', 'Accounts Processing', 'Paid');

UPDATE public.claims
SET status = 'Accounts Verification'
WHERE status = 'Closed'
  AND paid_date IS NULL
  AND paid_amount IS NULL;
