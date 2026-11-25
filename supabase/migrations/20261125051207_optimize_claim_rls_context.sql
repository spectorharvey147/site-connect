BEGIN;

-- RLS policies call the custom-session helpers for each candidate row. Wrap
-- their stable values in scalar subqueries so Postgres evaluates each value
-- once per request instead of repeating the session lookup across the claim
-- and expense rows.
DROP POLICY IF EXISTS claims_read ON public.claims;
CREATE POLICY claims_read ON public.claims FOR SELECT USING (
  (SELECT public.app_current_role()) = ANY (ARRAY['Accounts', 'Master Admin'])
  OR (
    (SELECT public.app_current_department_id()) IS NOT NULL
    AND department_id = (SELECT public.app_current_department_id())
    AND (
      (SELECT public.app_current_role()) = ANY (ARRAY['Admin', 'Super Admin'])
      OR user_email = (SELECT public.app_current_email())
      OR manager_email = (SELECT public.app_current_email())
    )
  )
);

DROP POLICY IF EXISTS users_read ON public.users;
CREATE POLICY users_read ON public.users FOR SELECT USING (
  email = (SELECT public.app_current_email())
  OR (SELECT public.app_current_role()) = ANY (ARRAY['Accounts', 'Master Admin'])
  OR (
    (SELECT public.app_current_role()) = ANY (ARRAY['Admin', 'Super Admin'])
    AND (SELECT public.app_current_department_id()) IS NOT NULL
    AND department_id = (SELECT public.app_current_department_id())
  )
  OR (
    (SELECT public.app_current_role()) <> ALL (ARRAY['Admin', 'Super Admin', 'Accounts', 'Master Admin'])
    AND (SELECT public.app_current_department_id()) IS NOT NULL
    AND department_id = (SELECT public.app_current_department_id())
  )
);

COMMIT;
