-- Keep posted financial ledger rows immutable for browser-facing roles.
DROP POLICY IF EXISTS transactions_update ON public.transactions;
DROP POLICY IF EXISTS transactions_delete ON public.transactions;

REVOKE UPDATE, DELETE ON TABLE public.transactions FROM anon, authenticated;
