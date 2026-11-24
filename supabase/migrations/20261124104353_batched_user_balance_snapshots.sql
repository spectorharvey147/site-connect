CREATE INDEX IF NOT EXISTS idx_transactions_user_latest_balance
  ON public.transactions(user_email, created_at DESC, id DESC)
  INCLUDE (balance_after);

CREATE OR REPLACE FUNCTION public.get_user_balance_snapshots(p_user_emails text[])
RETURNS TABLE(user_email text, current_balance numeric, last_transaction_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    u.email,
    COALESCE(latest.balance_after, u.advance_amount, 0)::numeric,
    latest.created_at
  FROM public.users u
  LEFT JOIN LATERAL (
    SELECT t.balance_after, t.created_at
    FROM public.transactions t
    WHERE t.user_email = u.email
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT 1
  ) latest ON true
  WHERE u.email = ANY(COALESCE(p_user_emails, ARRAY[]::text[]));
$$;

REVOKE ALL ON FUNCTION public.get_user_balance_snapshots(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_balance_snapshots(text[]) TO anon, authenticated;
