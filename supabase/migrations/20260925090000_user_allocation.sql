BEGIN;

CREATE TABLE IF NOT EXISTS public.user_manager_allocation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  previous_manager_email text,
  manager_email text,
  assigned_by text NOT NULL,
  action text NOT NULL CHECK (action IN ('assigned', 'reassigned', 'unassigned')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_manager_allocation_history_user
  ON public.user_manager_allocation_history(user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_manager_allocation_history_manager
  ON public.user_manager_allocation_history(manager_email, created_at DESC);

ALTER TABLE public.user_manager_allocation_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_manager_allocation_history FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_users_to_manager(
  p_token text,
  p_user_emails text[],
  p_manager_email text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor jsonb := public.app_session(p_token);
  manager_key text := nullif(lower(trim(p_manager_email)), '');
  target_emails text[];
  affected integer := 0;
BEGIN
  IF actor IS NULL OR actor->>'role' NOT IN ('Admin', 'Super Admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT array_agg(DISTINCT lower(trim(value)))
  INTO target_emails
  FROM unnest(coalesce(p_user_emails, ARRAY[]::text[])) AS selected_email(value)
  WHERE nullif(trim(value), '') IS NOT NULL;

  IF coalesce(array_length(target_emails, 1), 0) = 0
    OR array_length(target_emails, 1) > 500 THEN
    RAISE EXCEPTION 'Select between 1 and 500 users';
  END IF;

  IF manager_key IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(email) = manager_key
      AND active
      AND role IN ('Manager', 'Super Admin')
  ) THEN
    RAISE EXCEPTION 'Choose an active manager';
  END IF;

  INSERT INTO public.user_manager_allocation_history (
    user_email,
    previous_manager_email,
    manager_email,
    assigned_by,
    action
  )
  SELECT
    u.email,
    nullif(lower(trim(u.manager_email)), ''),
    manager_key,
    actor->>'email',
    CASE
      WHEN manager_key IS NULL THEN 'unassigned'
      WHEN nullif(lower(trim(u.manager_email)), '') IS NULL THEN 'assigned'
      ELSE 'reassigned'
    END
  FROM public.users u
  WHERE lower(u.email) = ANY(target_emails)
    AND u.role = 'User'
    AND u.active
    AND nullif(lower(trim(u.manager_email)), '') IS DISTINCT FROM manager_key;

  UPDATE public.users
  SET manager_email = manager_key
  WHERE lower(email) = ANY(target_emails)
    AND role = 'User'
    AND active
    AND nullif(lower(trim(manager_email)), '') IS DISTINCT FROM manager_key;

  GET DIAGNOSTICS affected = ROW_COUNT;

  INSERT INTO public.audit_logs(action, performed_by, target_type, target_id, details)
  VALUES (
    CASE WHEN manager_key IS NULL THEN 'users_unassigned_from_manager' ELSE 'users_assigned_to_manager' END,
    actor->>'email',
    'user_allocation',
    coalesce(manager_key, 'unassigned'),
    affected::text || ' active user(s) updated'
  );

  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_users_to_manager(text, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_users_to_manager(text, text[], text) TO anon, authenticated;

COMMIT;
