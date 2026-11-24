BEGIN;

-- The Work Allocation screen is available to Master Admin, but the original
-- finance session guard omitted that role and rejected valid Master sessions.
CREATE OR REPLACE FUNCTION public.require_finance_session(
  p_token text,
  p_admin_only boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor text;
BEGIN
  SELECT u.email INTO actor
  FROM public.sessions s
  JOIN public.users u ON lower(u.email) = lower(s.user_email)
  WHERE s.token = p_token
    AND s.expires_at > now()
    AND u.active
    AND (
      u.role IN ('Admin', 'Super Admin', 'Master Admin')
      OR (NOT p_admin_only AND u.role = 'Accounts')
    );

  IF actor IS NULL THEN
    RAISE EXCEPTION 'A valid authorized session is required';
  END IF;
  RETURN actor;
END;
$$;

REVOKE ALL ON FUNCTION public.require_finance_session(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_finance_session(text, boolean) TO anon, authenticated;

COMMIT;
